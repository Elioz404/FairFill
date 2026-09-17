import { randomUUID } from "node:crypto";
import { TtlCache, mapLimit } from "./cache";
import type { EngineConfig } from "./config";
import { Journal } from "./journal";
import { PublicBinance, type CatalogItem, type RwaDynamic } from "./public/binance";
import { BSC_CHAIN_ID, QUOTE_TOKEN } from "./shared/constants";
import { ISSUERS, ISSUER_ORDER, issuerFromCatalogType, issuerFromPlatformId } from "./shared/issuers";
import { HISTORY_RANGES, alignCandles, timeGrid, type Candle, type HistoryRange, type PriceHistory, type PriceSeries } from "./shared/history";
import { COMPANY_NAMES, SEARCH_ALIASES } from "./shared/names";
import {
  assessVenue,
  consensusPrice,
  explainDecision,
  rankVenues,
  sessionWarnings,
} from "./shared/rank";
import type { ReceiptSnapshot } from "./shared/receipt";
import { UNKNOWN_SESSION, toSession } from "./shared/session";
import type {
  Benchmark,
  DataMode,
  IssuerId,
  OrderRequest,
  RouteDecision,
  RouteOption,
  SessionInfo,
  StockListing,
  StockVersion,
  TapeSnapshot,
  VenueAssessment,
  VenueMarket,
  VenueQuote,
  VenueQuoteError,
} from "./shared/types";
import { fromBaseUnitsNumber, parseNumber, toBaseUnits } from "./shared/units";
import { Web3ApiClient, Web3ApiError, type KeyIssue } from "./web3api/client";
import { web3Api, type QuoteRoute, type RwaToken, type Web3Api } from "./web3api/endpoints";

export class NotConfiguredError extends Error {
  constructor(what: string) {
    super(`${what} requires Binance Web3 API keys (BINANCE_WEB3_API_KEY / BINANCE_WEB3_SECRET_KEY).`);
    this.name = "NotConfiguredError";
  }
}

interface ListingMarkets {
  markets: { version: StockVersion; market: VenueMarket }[];
  usPrice: number | null;
  session: SessionInfo;
}

const addrKey = (address: string) => address.toLowerCase();

/** How long rejected keys keep the engine on public data before it probes the gateway again. */
const KEY_RETRY_MS = 60_000;

export interface ApiKeyIssue extends KeyIssue {
  at: number;
}

export class FairFillEngine {
  readonly journal: Journal;
  readonly api: Web3Api | null;
  readonly pub: PublicBinance;
  private keyIssue: ApiKeyIssue | null = null;
  private readonly probeCache = new TtlCache<void>(30_000);

  private readonly catalogCache = new TtlCache<Map<string, StockListing>>(10 * 60_000);
  private readonly marketCache = new TtlCache<ListingMarkets>(15_000);
  private readonly sessionCache = new TtlCache<SessionInfo>(30_000);
  private readonly historyCache = new TtlCache<PriceHistory | null>(90_000);

  constructor(readonly config: EngineConfig) {
    this.journal = new Journal(config.journal);
    this.pub = new PublicBinance(this.journal);
    this.api =
      config.apiKey && config.secretKey
        ? web3Api(
            new Web3ApiClient({
              apiKey: config.apiKey,
              secretKey: config.secretKey,
              journal: this.journal,
              onKeyStatus: (issue) => {
                this.keyIssue = issue ? { ...issue, at: Date.now() } : null;
              },
            }),
          )
        : null;
  }

  // ── API availability ────────────────────────────────────────────────────

  get keysConfigured(): boolean {
    return this.api !== null;
  }

  /** Set when the gateway rejected the configured keys; cleared by the next successful call. */
  get apiKeyIssue(): ApiKeyIssue | null {
    return this.keyIssue;
  }

  /** The signed API, or null when there are no keys or the gateway is rejecting them. */
  private get liveApi(): Web3Api | null {
    if (!this.api) return null;
    if (!this.keyIssue) return this.api;
    if (Date.now() - this.keyIssue.at > KEY_RETRY_MS) void this.probe();
    return null;
  }

  /** What the data on screen actually is: live needs keys the gateway accepts. */
  get mode(): DataMode {
    return this.liveApi ? "live" : "preview";
  }

  /** One cheap signed call, at most every 30 s, so the mode is known before a page renders. */
  probe(): Promise<void> {
    const api = this.api;
    if (!api) return Promise.resolve();
    return this.probeCache.get("probe", () =>
      api.rwaPlatforms().then(
        () => undefined,
        () => undefined,
      ),
    );
  }

  // ── Catalog ─────────────────────────────────────────────────────────────

  catalog(): Promise<Map<string, StockListing>> {
    return this.catalogCache.get("catalog", () => this.buildCatalog());
  }

  private async buildCatalog(): Promise<Map<string, StockListing>> {
    const [publicLists, liveTokens] = await Promise.all([
      Promise.allSettled(ISSUER_ORDER.map((id) => this.pub.catalog(ISSUERS[id].catalogType))),
      this.liveApi ? this.liveApi.rwaTokens({ binanceChainId: BSC_CHAIN_ID }).catch(() => null) : Promise.resolve(null),
    ]);

    const listings = new Map<string, StockListing>();
    const upsert = (version: StockVersion, name: string | null) => {
      const listing = listings.get(version.ticker) ?? { ticker: version.ticker, name: null, versions: [] };
      const existing = listing.versions.findIndex((v) => addrKey(v.address) === addrKey(version.address));
      if (existing >= 0) listing.versions[existing] = { ...listing.versions[existing], ...version };
      else listing.versions.push(version);
      listing.name = listing.name ?? name;
      listings.set(version.ticker, listing);
    };

    for (const result of publicLists) {
      if (result.status !== "fulfilled") continue;
      for (const item of result.value) {
        const version = fromCatalogItem(item);
        if (version) upsert(version, COMPANY_NAMES[version.ticker] ?? null);
      }
    }

    // Live data wins for names, ratios and decimals (RWA Data API covers Ondo + bStocks).
    for (const token of liveTokens ?? []) {
      const version = fromRwaToken(token);
      if (version) upsert(version, token.underlyingName || null);
    }
    for (const listing of listings.values()) {
      const liveTokensForTicker = liveTokens?.filter((t) => t.underlyingTicker === listing.ticker) ?? [];
      const liveName = liveTokensForTicker.find((t) => t.underlyingName)?.underlyingName;
      listing.name = liveName ?? listing.name ?? COMPANY_NAMES[listing.ticker] ?? null;
      const liveLogo =
        liveTokensForTicker.find((t) => t.platformId === "ondo" && t.tokenLogoUrl)?.tokenLogoUrl ??
        liveTokensForTicker.find((t) => t.tokenLogoUrl)?.tokenLogoUrl;
      if (liveLogo) listing.logoUrl = liveLogo;
      listing.versions.sort((a, b) => ISSUER_ORDER.indexOf(a.issuer) - ISSUER_ORDER.indexOf(b.issuer));
    }
    if (listings.size === 0) throw new Error("Could not load the tokenized stock catalog from any source.");
    return listings;
  }

  async listing(ticker: string): Promise<StockListing | null> {
    return (await this.catalog()).get(ticker.trim().toUpperCase()) ?? null;
  }

  async directory(): Promise<StockListing[]> {
    const all = [...(await this.catalog()).values()];
    return all.sort((a, b) => b.versions.length - a.versions.length || a.ticker.localeCompare(b.ticker));
  }

  async search(query: string, limit = 12): Promise<StockListing[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const catalog = await this.catalog();
    const alias = SEARCH_ALIASES[q];
    const scored: { listing: StockListing; score: number }[] = [];
    for (const listing of catalog.values()) {
      const ticker = listing.ticker.toLowerCase();
      const name = (listing.name ?? "").toLowerCase();
      let score = 0;
      if (alias && listing.ticker === alias) score = 100;
      else if (ticker === q) score = 90;
      else if (listing.versions.some((v) => v.symbol.toLowerCase() === q || addrKey(v.address) === q)) score = 85;
      else if (ticker.startsWith(q)) score = 70;
      else if (name.startsWith(q)) score = 60;
      else if (name.includes(q)) score = 40;
      if (score > 0) scored.push({ listing, score: score + listing.versions.length });
    }
    return scored
      .sort((a, b) => b.score - a.score || a.listing.ticker.localeCompare(b.listing.ticker))
      .slice(0, limit)
      .map((s) => s.listing);
  }

  async versionByAddress(address: string): Promise<{ listing: StockListing; version: StockVersion } | null> {
    for (const listing of (await this.catalog()).values()) {
      const version = listing.versions.find((v) => addrKey(v.address) === addrKey(address));
      if (version) return { listing, version };
    }
    return null;
  }

  // ── Market data ─────────────────────────────────────────────────────────

  /** Market-wide US session as reported by the Ondo status feed. */
  marketSession(): Promise<SessionInfo> {
    return this.sessionCache.get("session", () => this.pub.ondoMarketStatus().then(toSession).catch(() => UNKNOWN_SESSION));
  }

  private listingMarkets(listing: StockListing): Promise<ListingMarkets> {
    return this.marketCache.get(listing.ticker, () => this.loadListingMarkets(listing));
  }

  private async loadListingMarkets(listing: StockListing): Promise<ListingMarkets> {
    // The public RWA feed is the only source of an independent US-market price, so it is read in both modes.
    const dynamics = new Map<string, RwaDynamic | null>();
    const readDynamics = (versions: StockVersion[]) =>
      mapLimit(versions, 3, async (v) => {
        dynamics.set(addrKey(v.address), await this.pub.rwaDynamic(v.chainId, v.address).catch(() => null));
      });
    const live = this.liveApi;
    await readDynamics(live ? pickReferenceVersions(listing.versions) : listing.versions);

    let markets = live ? await this.loadLiveMarkets(live, listing, dynamics) : null;
    if (!markets || !this.liveApi) {
      // No keys, or the gateway rejected them during this load: use the public feed for every version.
      await readDynamics(listing.versions.filter((v) => !dynamics.has(addrKey(v.address))));
      markets = await this.loadPreviewMarkets(listing, dynamics);
    }

    const usPrice = firstNumber(
      ["ondo", "xstocks", "bstocks"].flatMap((issuer) =>
        listing.versions.filter((v) => v.issuer === issuer).map((v) => dynamics.get(addrKey(v.address))?.stockInfo?.price),
      ),
    );
    const referenceMarket =
      markets.find((m) => m.version.issuer === "ondo" && m.market.session.status !== "unknown") ??
      markets.find((m) => m.version.issuer === "bstocks" && m.market.session.status !== "unknown");
    let session = referenceMarket?.market.session ?? UNKNOWN_SESSION;
    if (session.status === "unknown") session = await this.marketSession();
    return { markets, usPrice, session };
  }

  private async loadPreviewMarkets(listing: StockListing, dynamics: Map<string, RwaDynamic | null>) {
    return mapLimit(listing.versions, 3, async (version) => {
      const rwa = dynamics.get(addrKey(version.address)) ?? null;
      const dyn = await this.pub.tokenDynamic(version.chainId, version.address).catch(() => null);
      const tokenPrice = parseNumber(rwa?.tokenInfo?.price) ?? parseNumber(dyn?.price);
      const ratio = parseNumber(rwa?.tokenInfo?.sharesMultiplier) ?? version.shareRatio;
      const buy = parseNumber(dyn?.volume24hBuy);
      const sell = parseNumber(dyn?.volume24hSell);
      const market: VenueMarket = {
        tokenPriceUsd: tokenPrice,
        perSharePriceUsd: tokenPrice !== null && ratio > 0 ? tokenPrice / ratio : null,
        priceUpdatedAt: null,
        onchainVolume24hUsd: buy === null && sell === null ? null : (buy ?? 0) + (sell ?? 0),
        liquidityUsd: parseNumber(dyn?.liquidity),
        holders: parseNumber(dyn?.holders),
        session: toSession(rwa?.statusInfo),
      };
      return { version: { ...version, shareRatio: ratio }, market };
    });
  }

  private async loadLiveMarkets(api: Web3Api, listing: StockListing, dynamics: Map<string, RwaDynamic | null>) {
    const tokens = listing.versions.map((v) => ({ binanceChainId: v.chainId, tokenContractAddress: v.address }));
    const rwaCovered = listing.versions.filter((v) => ISSUERS[v.issuer].rwaPlatformId);
    const [infos, prices, sessions] = await Promise.all([
      api.priceInfo(tokens).catch(() => []),
      rwaCovered.length ? api.rwaPrice(BSC_CHAIN_ID, rwaCovered.map((v) => v.address)).catch(() => []) : Promise.resolve([]),
      mapLimit(rwaCovered, 2, async (v) => [addrKey(v.address), await api.rwaMarket(v.chainId, v.address).catch(() => null)] as const),
    ]);
    const infoBy = new Map(infos.map((i) => [addrKey(i.tokenContractAddress), i]));
    const priceBy = new Map(prices.map((p) => [addrKey(p.tokenContractAddress), p]));
    const sessionBy = new Map(sessions);

    return mapLimit(listing.versions, 3, async (version) => {
      const key = addrKey(version.address);
      const info = infoBy.get(key);
      const price = priceBy.get(key);
      let session = toSession(sessionBy.get(key)?.statusInfo);
      if (session.status === "unknown" && session.open === null) {
        // xStocks is outside the RWA Data API: fall back to the public status.
        const rwa = dynamics.get(key) ?? (await this.pub.rwaDynamic(version.chainId, version.address).catch(() => null));
        session = toSession(rwa?.statusInfo);
      }
      const tokenPrice = parseNumber(price?.tokenPrice) ?? parseNumber(info?.price);
      const buy = parseNumber(info?.buyVolume24H);
      const sell = parseNumber(info?.sellVolume24H);
      const market: VenueMarket = {
        tokenPriceUsd: tokenPrice,
        perSharePriceUsd: tokenPrice !== null && version.shareRatio > 0 ? tokenPrice / version.shareRatio : null,
        priceUpdatedAt: price?.tokenPriceUpdatedAt ?? info?.time ?? null,
        onchainVolume24hUsd: buy === null && sell === null ? null : (buy ?? 0) + (sell ?? 0),
        liquidityUsd: parseNumber(info?.liquidity),
        holders: parseNumber(info?.holders),
        session,
      };
      return { version, market };
    });
  }

  private benchmark(data: ListingMarkets): Benchmark {
    if (data.usPrice !== null) {
      return { priceUsd: data.usPrice, source: "us-market", note: "last US-market price of the underlying share." };
    }
    const consensus = consensusPrice(data.markets, this.config.policy);
    if (consensus !== null) {
      return {
        priceUsd: consensus,
        source: "onchain-consensus",
        note: "no live US price (market closed) — median per-share price of the versions that actually trade.",
      };
    }
    return { priceUsd: null, source: "unavailable", note: "no trustworthy reference right now." };
  }

  async tape(ticker: string): Promise<TapeSnapshot | null> {
    const listing = await this.listing(ticker);
    if (!listing) return null;
    const data = await this.listingMarkets(listing);
    const benchmark = this.benchmark(data);
    const venues = data.markets.map(({ version, market }) =>
      assessVenue({ version, market, quote: null, side: "buy", amountUsd: 100, tokens: null, benchmark, policy: this.config.policy }),
    );
    return { mode: this.mode, fetchedAt: Date.now(), listing, benchmark, session: data.session, venues };
  }

  /** Per-share price history of every version (or the given issuers) on one time grid. */
  history(ticker: string, range: HistoryRange, issuers?: IssuerId[]): Promise<PriceHistory | null> {
    const key = `${ticker.toUpperCase()}:${range}:${issuers?.join(",") ?? "all"}`;
    return this.historyCache.get(key, async () => {
      const listing = await this.listing(ticker);
      if (!listing) return null;
      const spec = HISTORY_RANGES[range];
      const grid = timeGrid(range);
      const versions = issuers ? listing.versions.filter((v) => issuers.includes(v.issuer)) : listing.versions;
      let usedApi = false;
      const series = await mapLimit(versions, 3, async (version): Promise<PriceSeries> => {
        let candles: Candle[] | null = null;
        const live = this.liveApi;
        if (live) {
          try {
            const rows = await live.candles({ binanceChainId: version.chainId, tokenContractAddress: version.address, bar: spec.interval, limit: spec.points });
            // Market API row: [open, high, low, close, volume, timestamp, tradeCount]
            candles = rows.map((r) => ({ t: Number(r[5]), close: Number(r[3]) }));
            usedApi = true;
          } catch {
            candles = null;
          }
        }
        if (!candles) {
          // Public K-line row: [openTime, open, high, low, close, reserved, closeTime]
          const rows = await this.pub.kline(version.chainId, version.address, spec.interval, spec.points).catch(() => []);
          candles = rows.map((r) => ({ t: Number(r[0]), close: Number(r[4]) }));
        }
        const inWindow = candles.filter((c) => c.t >= (grid[0] as number) - spec.stepMs);
        return {
          issuer: version.issuer,
          symbol: version.symbol,
          address: version.address,
          values: alignCandles(candles, grid, version.shareRatio),
          lastTradeAt: candles.length ? Math.max(...candles.map((c) => c.t)) : null,
          candleCount: inWindow.length,
        };
      });
      return { ticker: listing.ticker, range, times: grid, series, source: usedApi ? "web3-api" : "public" };
    });
  }

  async board(tickers: string[]): Promise<TapeSnapshot[]> {
    const snapshots = await mapLimit(tickers, 3, (t) => this.tape(t).catch(() => null));
    return snapshots.filter((s): s is TapeSnapshot => s !== null);
  }

  // ── Routing ─────────────────────────────────────────────────────────────

  async route(order: OrderRequest): Promise<RouteDecision> {
    const listing = await this.listing(order.ticker);
    if (!listing) throw new Error(`Unknown ticker: ${order.ticker}`);
    const side = order.side;
    if (side === "buy" && !(order.amountUsd && order.amountUsd > 0)) throw new Error("amountUsd must be a positive number for buys");
    if (side === "sell" && !(order.tokens && order.tokens > 0 && order.issuer)) throw new Error("sells need tokens (> 0) and the issuer you hold");

    const data = await this.listingMarkets(listing);
    const benchmark = this.benchmark(data);
    const wallet = order.wallet ?? this.config.quoteWallet;
    const live = this.liveApi;

    const assess = (quotes: Web3Api | null) =>
      mapLimit(data.markets, 3, async ({ version, market }): Promise<VenueAssessment> => {
      if (side === "sell" && version.issuer !== order.issuer) {
        return {
          version,
          market,
          quote: null,
          indicative: true,
          shares: null,
          effectivePerShareUsd: market.perSharePriceUsd,
          costBps: null,
          excluded: { code: "NOT_HELD", reason: "" },
          flags: [],
        };
      }
      const quote = quotes ? await this.quoteVersion(quotes, version, side, side === "buy" ? order.amountUsd! : order.tokens!, wallet) : null;
      return assessVenue({
        version,
        market,
        quote,
        side,
        amountUsd: order.amountUsd ?? null,
        tokens: order.tokens ?? null,
        benchmark,
        policy: this.config.policy,
      });
    });
    let assessments = await assess(live);
    // Rejected keys fail every quote the same way; fall back to indicative prices instead.
    if (live && !this.liveApi) assessments = await assess(null);

    const { ranked, excluded } = rankVenues(assessments);
    const best = ranked[0] ?? null;
    const costs = ranked.map((r) => r.costBps).filter((c): c is number => c !== null);
    const warnings = sessionWarnings(data.session);
    const mode = this.mode;
    const issue = this.keyIssue;
    if (mode === "preview" && issue) {
      warnings.unshift(
        `The Binance Web3 API rejected this server's keys (${issue.code}: ${issue.message}). Showing indicative public prices; nothing can execute until the keys work.`,
      );
    } else if (mode === "preview") {
      warnings.unshift("Preview mode: indicative prices only. Add Binance Web3 API keys for executable quotes.");
    }
    if (!wallet && mode === "live") warnings.push("No wallet address: RFQ venues (Ondo, bStocks RFQ) cannot be quoted.");

    return {
      id: randomUUID(),
      mode,
      createdAt: Date.now(),
      order: {
        ticker: listing.ticker,
        side,
        amountUsd: order.amountUsd ?? null,
        tokens: order.tokens ?? null,
        issuer: order.issuer ?? null,
        wallet: order.wallet ?? null,
      },
      listing: { ticker: listing.ticker, name: listing.name },
      benchmark,
      session: data.session,
      best,
      ranked,
      excluded,
      spreadBps: costs.length > 1 ? Math.max(...costs) - Math.min(...costs) : null,
      explanation: explainDecision({ side, best, ranked, excluded, benchmark }),
      warnings,
    };
  }

  private legs(version: StockVersion, side: "buy" | "sell", amount: number) {
    return side === "buy"
      ? { from: QUOTE_TOKEN.address, to: version.address, amountIn: toBaseUnits(amount, QUOTE_TOKEN.decimals) }
      : { from: version.address, to: QUOTE_TOKEN.address, amountIn: toBaseUnits(amount, version.decimals) };
  }

  private async quoteVersion(
    api: Web3Api,
    version: StockVersion,
    side: "buy" | "sell",
    amount: number,
    wallet: string | null,
  ): Promise<VenueQuote | VenueQuoteError> {
    const { from, to, amountIn } = this.legs(version, side, amount);
    try {
      const routes = await api.quote({
        binanceChainId: version.chainId,
        amount: amountIn,
        fromTokenAddress: from,
        toTokenAddress: to,
        userWalletAddress: wallet ?? undefined,
      });
      return toVenueQuote(amountIn, routes);
    } catch (error) {
      if (error instanceof Web3ApiError) return { ok: false, code: error.code, message: error.apiMessage };
      return { ok: false, code: null, message: error instanceof Error ? error.message : String(error) };
    }
  }

  receiptFor(decision: RouteDecision): ReceiptSnapshot | null {
    const best = decision.best;
    if (!best) return null;
    return {
      v: 1,
      ticker: decision.listing.ticker,
      side: decision.order.side,
      issuer: best.version.issuer,
      symbol: best.version.symbol,
      address: best.version.address,
      decimals: best.version.decimals,
      shareRatio: best.version.shareRatio,
      amountUsd: decision.order.amountUsd,
      tokens: decision.order.tokens,
      expectedShares: best.shares,
      expectedCostBps: best.costBps,
      benchmarkUsd: decision.benchmark.priceUsd,
      benchmarkSource: decision.benchmark.source,
      alternatives: [...decision.ranked.slice(1), ...decision.excluded]
        .filter((a) => a.excluded?.code !== "NOT_HELD")
        .map((a) => ({ symbol: a.version.symbol, issuer: a.version.issuer, costBps: a.costBps, excluded: a.excluded?.reason ?? null })),
      decidedAt: decision.createdAt,
    };
  }

  // ── Execution (live only) ───────────────────────────────────────────────

  requireApi(): Web3Api {
    if (!this.api) throw new NotConfiguredError("This action");
    const issue = this.keyIssue;
    if (!this.liveApi && issue) throw new Error(`The Binance Web3 API is rejecting this server's keys (${issue.code}: ${issue.message}).`);
    return this.api;
  }

  /** Fresh quote + unsigned transaction (SWAP) or EIP-712 order (RFQ) for one version. */
  async buildExecution(input: { address: string; side: "buy" | "sell"; amount: number; wallet: string; slippagePercent?: string }) {
    const api = this.requireApi();
    const found = await this.versionByAddress(input.address);
    if (!found) throw new Error(`Unknown stock token: ${input.address}`);
    const { version } = found;
    const { from, to, amountIn } = this.legs(version, input.side, input.amount);
    const quote = toVenueQuote(
      amountIn,
      await api.quote({ binanceChainId: version.chainId, amount: amountIn, fromTokenAddress: from, toTokenAddress: to, userWalletAddress: input.wallet }),
    );
    if (!quote.ok) throw new Web3ApiError("quote", quote.code, quote.message, null);
    const swap = await api.swap({
      binanceChainId: version.chainId,
      amount: amountIn,
      fromTokenAddress: from,
      toTokenAddress: to,
      userWalletAddress: input.wallet,
      quoteId: quote.best.quoteId,
      ...(input.slippagePercent ? { slippagePercent: input.slippagePercent } : { autoSlippage: "true" as const }),
    });
    let simulation: { ok: boolean; status?: string; failReason?: string | null; error?: string } | null = null;
    if (swap.executionMode === "SWAP" && swap.tx) {
      simulation = await api
        .simulate({ binanceChainId: version.chainId, evmTx: { from: swap.tx.from, to: swap.tx.to, value: swap.tx.value, data: swap.tx.data } })
        .then((s) => ({ ok: !/fail/i.test(s.status), status: s.status, failReason: s.failReason }))
        .catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    }
    return {
      version,
      fromToken: from,
      toToken: to,
      amountIn,
      route: quote.best,
      executionMode: swap.executionMode,
      tx: swap.tx ?? null,
      rfq: swap.rfq ?? null,
      simulation,
    };
  }

  async approveCalldata(input: { token: string; amount: string; vendor?: string }) {
    const api = this.requireApi();
    const items = await api.approveTx({ binanceChainId: BSC_CHAIN_ID, tokenContractAddress: input.token, approveAmount: input.amount, vendor: input.vendor });
    const first = items[0];
    if (!first) throw new Error("approve-transaction returned no calldata");
    // approve() is called on the token contract; dexContractAddress is the spender.
    return { to: input.token, data: first.data, spender: first.dexContractAddress, gasLimit: first.gasLimit, gasPrice: first.gasPrice };
  }

  submitRfq(input: { signature: string; vendor: string; quoteId: string; signingScheme?: string; requestId?: string }) {
    return this.requireApi().submitRfq({
      requestId: input.requestId ?? randomUUID(),
      userSignature: input.signature,
      vendor: input.vendor,
      quoteId: input.quoteId,
      signingScheme: input.signingScheme,
    });
  }

  rfqOrder(orderId: string) {
    return this.requireApi().rfqOrder(orderId);
  }

  txDetail(txHash: string) {
    return this.requireApi().txDetail(BSC_CHAIN_ID, txHash);
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

function fromCatalogItem(item: CatalogItem): StockVersion | null {
  if (item.chainId !== BSC_CHAIN_ID) return null;
  const issuer = issuerFromCatalogType(item.type);
  if (!issuer || !item.ticker || !item.contractAddress) return null;
  return {
    issuer,
    ticker: item.ticker.toUpperCase(),
    symbol: item.symbol,
    address: item.contractAddress,
    chainId: item.chainId,
    assetType: item.assetType ?? null,
    shareRatio: parseNumber(item.multiplier) ?? 1,
    decimals: typeof item.d === "number" ? item.d : 18,
  };
}

function fromRwaToken(token: RwaToken): StockVersion | null {
  if (token.binanceChainId !== BSC_CHAIN_ID) return null;
  const issuer = issuerFromPlatformId(token.platformId);
  if (!issuer || !token.underlyingTicker) return null;
  return {
    issuer,
    ticker: token.underlyingTicker.toUpperCase(),
    symbol: token.tokenSymbol,
    address: token.tokenContractAddress,
    chainId: token.binanceChainId,
    assetType: token.assetType ?? null,
    shareRatio: parseNumber(token.tokenToShareRatio) ?? 1,
    decimals: parseNumber(token.decimals) ?? 18,
  };
}

/** In live mode we only need the public feed for the US price: one version is enough. */
function pickReferenceVersions(versions: StockVersion[]): StockVersion[] {
  const preferred = ["ondo", "xstocks", "bstocks"] as IssuerId[];
  for (const issuer of preferred) {
    const v = versions.find((x) => x.issuer === issuer);
    if (v) return [v];
  }
  return [];
}

function firstNumber(values: unknown[]): number | null {
  for (const v of values) {
    const n = parseNumber(v);
    if (n !== null && n > 0) return n;
  }
  return null;
}

export function toVenueQuote(amountIn: string, routes: QuoteRoute[] | null | undefined): VenueQuote | VenueQuoteError {
  if (!routes || routes.length === 0) return { ok: false, code: null, message: "No route returned for this pair" };
  const options: RouteOption[] = routes.map((r) => ({
    mode: r.executionMode,
    vendor: r.vendorName,
    quoteId: r.quoteId,
    amountOut: r.toTokenAmount,
    amountOutDecimal: fromBaseUnitsNumber(r.toTokenAmount, Number(r.toToken?.decimal ?? 18)),
    priceImpactPct: parseNumber(r.priceImpactPercent),
    networkFeeUsd: parseNumber(r.tradeFee),
    approveTarget: r.approveTarget ?? null,
    isBest: Boolean(r.isBest),
  }));
  const honeypot = routes.find((r) => r.toToken?.isHoneyPot);
  if (honeypot) return { ok: false, code: "HONEYPOT", message: `${honeypot.toToken.tokenSymbol} is flagged as a honeypot by the Trading API` };
  const best = options.find((o) => o.isBest) ?? [...options].sort((a, b) => b.amountOutDecimal - a.amountOutDecimal)[0];
  return { ok: true, amountIn, best: best as RouteOption, routes: options, quotedAt: Date.now() };
}

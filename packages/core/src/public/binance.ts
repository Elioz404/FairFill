import type { Journal } from "../journal";

/**
 * Keyless endpoints used by the official Binance Wallet Skills
 * (binance-tokenized-securities-info, query-token-info). FairFill uses them for
 * the cross-issuer catalog (xStocks is not in the RWA Data API) and for the
 * independent US-market price, which the RWA Data API does not provide
 * (its referencePrice is derived from the on-chain token price).
 */
const HOST = "https://www.binance.com/bapi/defi";
const HEADERS = { "Accept-Encoding": "identity", "User-Agent": "binance-web3/1.1 (Skill)" };

export interface CatalogItem {
  chainId: string;
  contractAddress: string;
  symbol: string;
  ticker: string;
  type: 1 | 2 | 3;
  assetType?: number | null;
  multiplier?: string;
  d?: number;
  cs?: string;
}

export interface RwaDynamic {
  symbol: string;
  ticker: string;
  tokenInfo?: { price?: string; sharesMultiplier?: string; totalHolders?: string };
  stockInfo?: { price?: string | null; priceHigh52w?: string; priceLow52w?: string; marketCap?: string; priceToEarnings?: string };
  statusInfo?: Record<string, unknown>;
}

export interface TokenDynamic {
  price?: string;
  holders?: string;
  liquidity?: string | null;
  volume24hBuy?: string;
  volume24hSell?: string;
}

export interface TokenMeta {
  name?: string;
  symbol?: string;
  icon?: string;
  decimals?: number;
}

export class PublicBinance {
  constructor(private readonly journal?: Journal) {}

  private async get<T>(path: string): Promise<T> {
    const started = Date.now();
    const endpoint = `public:${path.split("?")[0]}`;
    let status: number | null = null;
    try {
      const res = await fetch(`${HOST}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(12_000) });
      status = res.status;
      const body = (await res.json()) as { code?: string; success?: boolean; data?: T; message?: string };
      const ok = res.ok && body.success === true;
      this.journal?.record({ ts: started, method: "GET", endpoint, httpStatus: status, code: body.code ?? null, message: ok ? null : body.message ?? null, ok, ms: Date.now() - started });
      if (!ok) throw new Error(`${endpoint} failed: ${body.code ?? status} ${body.message ?? ""}`.trim());
      return body.data as T;
    } catch (error) {
      if (status === null) {
        const message = error instanceof Error ? error.message : String(error);
        this.journal?.record({ ts: started, method: "GET", endpoint, httpStatus: null, code: null, message, ok: false, ms: Date.now() - started });
      }
      throw error;
    }
  }

  catalog(type: 1 | 2 | 3): Promise<CatalogItem[]> {
    return this.get(`/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai?type=${type}`);
  }

  rwaDynamic(chainId: string, address: string): Promise<RwaDynamic> {
    return this.get(`/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai?chainId=${chainId}&contractAddress=${address}`);
  }

  tokenDynamic(chainId: string, address: string): Promise<TokenDynamic> {
    return this.get(`/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info/ai?chainId=${chainId}&contractAddress=${address}`);
  }

  tokenMeta(chainId: string, address: string): Promise<TokenMeta> {
    return this.get(`/v1/public/wallet-direct/buw/wallet/dex/market/token/meta/info/ai?chainId=${chainId}&contractAddress=${address}`);
  }

  /** Candles as [openTime, open, high, low, close, reserved, closeTime]; only intervals with trades are returned. */
  async kline(chainId: string, address: string, interval: string, limit: number): Promise<[number, string, string, string, string, string, number][]> {
    const data = await this.get<{ klineInfos?: [number, string, string, string, string, string, number][] }>(
      `/v1/public/wallet-direct/buw/wallet/dex/market/token/kline/ai?chainId=${chainId}&contractAddress=${address}&interval=${interval}&limit=${limit}`,
    );
    return data?.klineInfos ?? [];
  }

  ondoMarketStatus(): Promise<Record<string, unknown>> {
    return this.get(`/v1/public/wallet-direct/buw/wallet/market/token/rwa/market/status/ai`);
  }
}

export const ICON_HOST = "https://bin.bnbstatic.com";

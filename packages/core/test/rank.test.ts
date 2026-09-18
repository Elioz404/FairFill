import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY,
  assessVenue,
  classifyQuoteError,
  consensusPrice,
  costBps,
  explainDecision,
  medianVolumeUsd,
  rankVenues,
} from "../src/shared/rank";
import type { Benchmark, SessionInfo, StockVersion, VenueMarket, VenueQuote } from "../src/shared/types";

// Fixtures mirror what the public feed returned for NVDA on 2026-09-16 (US regular session).
const open: SessionInfo = { open: true, status: "regular", reasonCode: "TRADING", reasonMsg: null, nextOpenTime: null, nextCloseTime: null };
const weekend: SessionInfo = { open: false, status: "closed", reasonCode: "MARKET_CLOSED", reasonMsg: "Weekend or Holiday", nextOpenTime: Date.now() + 36e5, nextCloseTime: null };

const version = (issuer: StockVersion["issuer"], symbol: string, shareRatio = 1): StockVersion => ({
  issuer,
  ticker: "NVDA",
  symbol,
  address: `0x${symbol.padEnd(40, "0")}`,
  chainId: "56",
  assetType: 1,
  shareRatio,
  decimals: 18,
});

const market = (perShare: number | null, volume: number | null, session = open): VenueMarket => ({
  tokenPriceUsd: perShare,
  perSharePriceUsd: perShare,
  priceUpdatedAt: null,
  onchainVolume24hUsd: volume,
  liquidityUsd: null,
  holders: null,
  session,
});

const ondo = version("ondo", "NVDAon", 1.00172);
const bstock = version("bstocks", "NVDAB", 1.00078);
const xstock = version("xstocks", "NVDAx", 1.00092);
const benchmark: Benchmark = { priceUsd: 215.66, source: "us-market", note: "test" };
const base = { side: "buy" as const, amountUsd: 100, tokens: null, benchmark, policy: DEFAULT_POLICY };

const okQuote = (tokensOut: number, extra: Partial<VenueQuote["best"]> = {}): VenueQuote => {
  const best = {
    mode: "SWAP" as const,
    vendor: "LiquidMesh",
    quoteId: "q1",
    amountOut: "0",
    amountOutDecimal: tokensOut,
    priceImpactPct: 0.1,
    networkFeeUsd: 0.02,
    approveTarget: null,
    isBest: true,
    feeUsd: null,
    ...extra,
  };
  return { ok: true, amountIn: "100000000000000000000", best, routes: [best], quotedAt: Date.now() };
};

describe("assessVenue — preview (displayed prices)", () => {
  it("flags the zero-turnover xStocks pool as a stale price, not a discount", () => {
    const a = assessVenue({ ...base, version: xstock, market: market(211.72, 0), quote: null });
    expect(a.excluded?.code).toBe("NO_LIQUIDITY");
    expect(a.excluded?.reason).toContain("stale");
  });

  it("excludes a pool that clears the absolute floor but trades a rounding error next to its peers", () => {
    // AAPL on 2026-09-17: the xStocks pool showed -119 bps on $1.2k of turnover while the other two
    // versions did millions. The absolute floor alone let it through and the home card called it the fair fill.
    const peerMedianVolumeUsd = 1_500_000;
    const a = assessVenue({ ...base, version: xstock, market: market(211.72, 1_200), quote: null, peerMedianVolumeUsd });
    expect(a.flags).toContain("stale-price");
    expect(a.excluded?.code).toBe("NO_LIQUIDITY");
    expect(a.excluded?.reason).toContain("against $1.5M at the other versions");
  });

  it("keeps the staleness rule relative: the same turnover passes when every version is small", () => {
    const a = assessVenue({ ...base, version: xstock, market: market(211.72, 1_200), quote: null, peerMedianVolumeUsd: 4_000 });
    expect(a.flags).not.toContain("stale-price");
    expect(a.flags).toContain("thin-liquidity");
    expect(a.excluded).toBeNull();
  });

  it("does not call a venue thin just because a sibling is deeper", () => {
    // NVDAon does $461k a day next to NVDAB's $5.5M: relative staleness must not drag the depth badge with it.
    const a = assessVenue({ ...base, version: ondo, market: market(219.62, 461_413), quote: null, peerMedianVolumeUsd: 461_413 });
    expect(a.flags).not.toContain("thin-liquidity");
    expect(a.flags).not.toContain("stale-price");
  });

  it("ranks liquid venues by premium to the reference", () => {
    const venues = [
      assessVenue({ ...base, version: bstock, market: market(216.34, 4_902_723), quote: null }),
      assessVenue({ ...base, version: ondo, market: market(216.13, 85_744), quote: null }),
      assessVenue({ ...base, version: xstock, market: market(211.72, 0), quote: null }),
    ];
    const { ranked, excluded } = rankVenues(venues);
    expect(ranked.map((r) => r.version.symbol)).toEqual(["NVDAon", "NVDAB"]);
    expect(Math.round(ranked[0]!.costBps!)).toBe(22);
    expect(excluded).toHaveLength(1);
    expect(ranked.every((r) => r.indicative)).toBe(true);
  });

  it("drops RFQ-only Ondo while its market is closed but keeps bStocks' AMM route", () => {
    const o = assessVenue({ ...base, version: ondo, market: market(216, 90_000, weekend), quote: null });
    const b = assessVenue({ ...base, version: bstock, market: market(217, 5_000_000, weekend), quote: null });
    expect(o.excluded?.code).toBe("HALTED");
    expect(b.excluded).toBeNull();
    expect(b.flags).toContain("rfq-closed");
  });

  it("halts every venue on a token-level corporate action", () => {
    const paused: SessionInfo = { ...open, open: false, status: "pause", reasonCode: "ASSET_PAUSED", reasonMsg: "stock_split" };
    const a = assessVenue({ ...base, version: bstock, market: market(216, 5_000_000, paused), quote: null });
    expect(a.excluded?.code).toBe("HALTED");
    expect(a.excluded?.reason).toContain("stock_split");
  });
});

describe("assessVenue — live quotes", () => {
  it("computes the all-in cost per share including the network fee and share ratio", () => {
    const a = assessVenue({ ...base, version: bstock, market: market(216.34, 4_902_723), quote: okQuote(0.4618) });
    const shares = 0.4618 * 1.00078;
    expect(a.indicative).toBe(false);
    expect(a.shares).toBeCloseTo(shares, 8);
    expect(a.effectivePerShareUsd).toBeCloseTo(100.02 / shares, 8);
    expect(a.costBps).toBeCloseTo((100.02 / shares / 215.66 - 1) * 10_000, 6);
  });

  it("maps documented Trading API errors to exclusions", () => {
    const min = assessVenue({ ...base, version: ondo, market: market(216, 90_000), quote: { ok: false, code: 40375, message: "Minimum order amount is 20 USD." } });
    expect(min.excluded?.code).toBe("BELOW_MINIMUM");
    const closed = assessVenue({ ...base, version: ondo, market: market(216, 90_000), quote: { ok: false, code: 40367, message: "ONDO_MARKET_STATE_NOT_TRADABLE" } });
    expect(closed.excluded?.code).toBe("HALTED");
    const dry = assessVenue({ ...base, version: xstock, market: market(211, 0), quote: { ok: false, code: 50000, message: "Internal error" } });
    expect(dry.excluded?.code).toBe("NO_LIQUIDITY");
  });

  it("asks for a wallet when an RFQ quote needs userWalletAddress", () => {
    expect(classifyQuoteError({ ok: false, code: 40001, message: "Parameter [userWalletAddress] error: required for RFQ" })).toBe("NEEDS_WALLET");
  });

  it("rejects routes with excessive price impact", () => {
    const a = assessVenue({ ...base, version: bstock, market: market(216, 5_000_000), quote: okQuote(0.45, { priceImpactPct: 7.5 }) });
    expect(a.excluded?.code).toBe("PRICE_IMPACT");
  });

  it("prefers an executable quote over an indicative price even if the latter looks cheaper", () => {
    const quoted = assessVenue({ ...base, version: bstock, market: market(216.34, 4_902_723), quote: okQuote(0.46) });
    const indicative = assessVenue({ ...base, version: ondo, market: market(200, 90_000), quote: null });
    expect(rankVenues([indicative, quoted]).ranked[0]!.version.symbol).toBe("NVDAB");
  });
});

describe("helpers", () => {
  it("signs costs so that positive is always worse for the user", () => {
    expect(costBps("buy", 101, 100)).toBeCloseTo(100);
    expect(costBps("sell", 99, 100)).toBeCloseTo(100);
    expect(costBps("sell", 101, 100)).toBeCloseTo(-100);
    expect(costBps("buy", 100, null)).toBeNull();
  });

  it("builds a consensus reference only from venues that trade", () => {
    const markets = [
      { version: ondo, market: market(216.13, 85_744) },
      { version: bstock, market: market(216.34, 4_902_723) },
      { version: xstock, market: market(211.72, 0) },
    ];
    expect(consensusPrice(markets, DEFAULT_POLICY)).toBeCloseTo((216.13 + 216.34) / 2);
  });

  it("keeps a stale venue out of the fallback reference", () => {
    // AAPL on 2026-09-17: the $1.2k xStocks pool showed $332.33 while the two live versions agreed near $337.
    const markets = [
      { version: bstock, market: market(336.57, 17_310_414) },
      { version: ondo, market: market(337.54, 119_394) },
      { version: xstock, market: market(332.33, 1_240) },
    ];
    expect(consensusPrice(markets, DEFAULT_POLICY)).toBeCloseTo((336.57 + 337.54) / 2);
  });

  it("takes the peer median over the versions that report a turnover", () => {
    expect(medianVolumeUsd([4_902_723, 85_744, 0])).toBe(85_744);
    expect(medianVolumeUsd([4_902_723, null, 85_744, undefined])).toBe((4_902_723 + 85_744) / 2);
    expect(medianVolumeUsd([null, undefined])).toBeNull();
  });

  it("explains the pick and every exclusion in plain words", () => {
    const venues = [
      assessVenue({ ...base, version: bstock, market: market(216.34, 4_902_723), quote: okQuote(0.4618) }),
      assessVenue({ ...base, version: xstock, market: market(211.72, 0), quote: { ok: false, code: 40421, message: "Insufficient liquidity" } }),
    ];
    const { ranked, excluded } = rankVenues(venues);
    const lines = explainDecision({ side: "buy", best: ranked[0]!, ranked, excluded, benchmark });
    expect(lines[0]).toMatch(/^Picked NVDAB \(bStocks\) via LiquidMesh swap/);
    expect(lines.some((l) => l.includes("NVDAx"))).toBe(true);
  });
});

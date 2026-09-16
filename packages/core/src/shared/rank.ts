import { ISSUERS } from "./issuers";
import { fmtBps, fmtCompactUsd, fmtDuration, fmtUsd } from "./format";
import { isCorporateAction, isWeekendLike } from "./session";
import type {
  Benchmark,
  ExclusionCode,
  Side,
  StockVersion,
  VenueAssessment,
  VenueFlag,
  VenueMarket,
  VenueQuote,
  VenueQuoteError,
} from "./types";

export interface RankPolicy {
  minOnchainVolumeUsd: number;
  maxPriceImpactPct: number;
}

export const DEFAULT_POLICY: RankPolicy = { minOnchainVolumeUsd: 1_000, maxPriceImpactPct: 3 };

export interface AssessInput {
  version: StockVersion;
  market: VenueMarket;
  quote: VenueQuote | VenueQuoteError | null;
  side: Side;
  /** buy: USD spent. */
  amountUsd: number | null;
  /** sell: tokens sold. */
  tokens: number | null;
  benchmark: Benchmark;
  policy: RankPolicy;
}

// Trading API error codes (docs: Trading API → Error Codes → RFQ Orders).
const QUOTE_ERROR_MAP: Record<string, ExclusionCode> = {
  "40367": "HALTED",
  "40369": "HALTED",
  "40375": "BELOW_MINIMUM",
  "40366": "BELOW_MINIMUM",
  "40421": "NO_LIQUIDITY",
  "40374": "NO_LIQUIDITY",
};

export function classifyQuoteError(error: VenueQuoteError): ExclusionCode {
  const mapped = error.code !== null ? QUOTE_ERROR_MAP[String(error.code)] : undefined;
  if (mapped) return mapped;
  if (/userWalletAddress/i.test(error.message)) return "NEEDS_WALLET";
  return "QUOTE_FAILED";
}

function exclusionReason(code: ExclusionCode, a: { version: StockVersion; market: VenueMarket; quote: VenueQuoteError | null }): string {
  const who = `${a.version.symbol} (${ISSUERS[a.version.issuer].label})`;
  const vol = a.market.onchainVolume24hUsd;
  switch (code) {
    case "HALTED":
      if (isCorporateAction(a.market.session)) {
        return `${who} is paused for a corporate action${a.market.session.reasonMsg ? ` (${a.market.session.reasonMsg})` : ""}.`;
      }
      return a.quote
        ? `${who} is not tradable right now: ${a.quote.message}`
        : `${who} only quotes while its market is open${a.market.session.reasonMsg ? ` (${a.market.session.reasonMsg})` : ""}.`;
    case "NO_LIQUIDITY":
      return vol !== null
        ? `${who} has ${fmtCompactUsd(vol)} of on-chain turnover in 24h — its displayed price is stale, not a discount.`
        : `${who} returned no liquidity for this size.`;
    case "BELOW_MINIMUM":
      return `${who} rejects this size: ${a.quote?.message ?? "below the issuer minimum"}`;
    case "PRICE_IMPACT":
      return `${who} would move the price too much for this size.`;
    case "NEEDS_WALLET":
      return `${who} trades by RFQ, which needs your wallet address to quote. Connect a wallet to include it.`;
    case "NO_PRICE":
      return `${who} has no usable price right now.`;
    case "NOT_HELD":
      return `${who} is a different token from the one you hold.`;
    case "QUOTE_FAILED":
    default:
      return `${who} could not be quoted: ${a.quote?.message ?? "unknown error"}`;
  }
}

export function assessVenue(input: AssessInput): VenueAssessment {
  const { version, market, quote, side, benchmark, policy } = input;
  const flags: VenueFlag[] = [];
  const session = market.session;
  const volume = market.onchainVolume24hUsd;

  if (version.issuer === "ondo") flags.push("rfq-only");
  if (isCorporateAction(session)) flags.push("corporate-action");
  if (session.open === false) {
    flags.push("market-closed");
    if (version.issuer === "bstocks") flags.push("rfq-closed");
  }
  if (volume !== null && volume < policy.minOnchainVolumeUsd) flags.push("stale-price");
  else if (volume !== null && volume < policy.minOnchainVolumeUsd * 25) flags.push("thin-liquidity");

  const base: VenueAssessment = {
    version,
    market,
    quote,
    indicative: !(quote && quote.ok),
    shares: null,
    effectivePerShareUsd: null,
    costBps: null,
    excluded: null,
    flags,
  };

  const exclude = (code: ExclusionCode): VenueAssessment => ({
    ...base,
    excluded: { code, reason: exclusionReason(code, { version, market, quote: quote && !quote.ok ? quote : null }) },
  });

  // Token-level halts block every route.
  if (isCorporateAction(session) && session.reasonCode === "ASSET_PAUSED") return exclude("HALTED");

  if (quote && !quote.ok) {
    const code = classifyQuoteError(quote);
    // A failed quote on a pool with no turnover is a liquidity problem, whatever the message says.
    if (code === "QUOTE_FAILED" && flags.includes("stale-price")) return exclude("NO_LIQUIDITY");
    return exclude(code);
  }

  if (quote && quote.ok) {
    const route = quote.best;
    if (route.priceImpactPct !== null && Math.abs(route.priceImpactPct) > policy.maxPriceImpactPct) {
      return exclude("PRICE_IMPACT");
    }
    const fee = route.networkFeeUsd ?? 0;
    let shares: number;
    let effective: number;
    if (side === "buy") {
      const spent = input.amountUsd ?? 0;
      shares = route.amountOutDecimal * version.shareRatio;
      if (shares <= 0) return exclude("NO_LIQUIDITY");
      effective = (spent + fee) / shares;
    } else {
      const sold = input.tokens ?? 0;
      shares = sold * version.shareRatio;
      if (shares <= 0) return exclude("NO_PRICE");
      effective = (route.amountOutDecimal - fee) / shares;
    }
    return {
      ...base,
      indicative: false,
      shares,
      effectivePerShareUsd: effective,
      costBps: costBps(side, effective, benchmark.priceUsd),
    };
  }

  // No quote (preview mode or quoting skipped): judge by displayed price.
  if (version.issuer === "ondo" && session.open === false) return exclude("HALTED");
  if (flags.includes("stale-price")) return exclude("NO_LIQUIDITY");
  const perShare = market.perSharePriceUsd;
  if (perShare === null || perShare <= 0) return exclude("NO_PRICE");
  const shares = side === "buy" ? (input.amountUsd ?? 0) / perShare : (input.tokens ?? 0) * version.shareRatio;
  return {
    ...base,
    indicative: true,
    shares,
    effectivePerShareUsd: perShare,
    costBps: costBps(side, perShare, benchmark.priceUsd),
  };
}

export function costBps(side: Side, effectivePerShare: number, reference: number | null): number | null {
  if (reference === null || reference <= 0) return null;
  const ratio = effectivePerShare / reference;
  return side === "buy" ? (ratio - 1) * 10_000 : (1 - ratio) * 10_000;
}

const MODE_PREFERENCE: Record<string, number> = { SWAP: 0, RFQ: 1 };

/** Best first. Eligible venues are ordered by cost, then by execution simplicity, then by turnover. */
export function rankVenues(assessments: VenueAssessment[]): { ranked: VenueAssessment[]; excluded: VenueAssessment[] } {
  const excluded = assessments.filter((a) => a.excluded);
  const eligible = assessments.filter((a) => !a.excluded);
  const score = (a: VenueAssessment) => a.costBps ?? Number.POSITIVE_INFINITY;
  const mode = (a: VenueAssessment) => (a.quote && a.quote.ok ? MODE_PREFERENCE[a.quote.best.mode] ?? 2 : 2);
  const ranked = [...eligible].sort((x, y) => {
    // Executable quotes beat indicative prices.
    if (x.indicative !== y.indicative) return x.indicative ? 1 : -1;
    const dc = score(x) - score(y);
    if (Math.abs(dc) > 0.5) return dc;
    const dm = mode(x) - mode(y);
    if (dm !== 0) return dm;
    return (y.market.onchainVolume24hUsd ?? 0) - (x.market.onchainVolume24hUsd ?? 0);
  });
  return { ranked, excluded };
}

/** Consensus reference from venues that actually trade. */
export function consensusPrice(markets: { version: StockVersion; market: VenueMarket }[], policy: RankPolicy): number | null {
  const prices = markets
    .filter((m) => m.market.perSharePriceUsd !== null && (m.market.onchainVolume24hUsd ?? 0) >= policy.minOnchainVolumeUsd)
    .map((m) => m.market.perSharePriceUsd as number)
    .sort((a, b) => a - b);
  if (prices.length === 0) return null;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 ? (prices[mid] as number) : ((prices[mid - 1] as number) + (prices[mid] as number)) / 2;
}

export interface ExplainInput {
  side: Side;
  best: VenueAssessment | null;
  ranked: VenueAssessment[];
  excluded: VenueAssessment[];
  benchmark: Benchmark;
  now?: number;
}

export function explainDecision({ side, best, ranked, excluded, benchmark }: ExplainInput): string[] {
  const lines: string[] = [];
  if (!best) {
    lines.push("No version of this stock can be filled right now.");
  } else {
    const who = `${best.version.symbol} (${ISSUERS[best.version.issuer].label})`;
    const where = best.quote && best.quote.ok ? ` via ${best.quote.best.vendor} ${best.quote.best.mode === "RFQ" ? "RFQ" : "swap"}` : "";
    const cost = best.costBps !== null
      ? side === "buy"
        ? `${fmtBps(best.costBps)} vs the fair reference (${fmtUsd(best.effectivePerShareUsd)} per share, all-in)`
        : `${fmtBps(best.costBps)} vs the fair reference (${fmtUsd(best.effectivePerShareUsd)} per share, net)`
      : "no reference available to compare against";
    lines.push(`Picked ${who}${where}: ${cost}.`);
    if (best.indicative) lines.push("Price is indicative — connect Binance Web3 API keys for an executable quote.");
    for (const other of ranked.slice(1)) {
      if (other.costBps === null || best.costBps === null) continue;
      lines.push(`${other.version.symbol} would cost ${fmtBps(other.costBps - best.costBps)} more.`);
    }
  }
  for (const ex of excluded) {
    if (ex.excluded && ex.excluded.code !== "NOT_HELD") lines.push(ex.excluded.reason);
  }
  if (benchmark.priceUsd !== null) lines.push(`Fair reference: ${fmtUsd(benchmark.priceUsd)} — ${benchmark.note}`);
  return lines;
}

export function sessionWarnings(session: VenueMarket["session"], now = Date.now()): string[] {
  const warnings: string[] = [];
  if (isWeekendLike(session)) {
    const opens = session.nextOpenTime ? ` It reopens in ${fmtDuration(session.nextOpenTime - now)}.` : "";
    warnings.push(`The US market is closed (${session.reasonMsg}). On-chain prices keep moving while the stock does not.${opens}`);
  } else if (session.open === false) {
    warnings.push("The underlying market is closed. RFQ routes pause; only AMM liquidity can fill.");
  }
  if (isCorporateAction(session)) {
    warnings.push(`Corporate action in progress${session.reasonMsg ? `: ${session.reasonMsg}` : ""}.`);
  }
  return warnings;
}

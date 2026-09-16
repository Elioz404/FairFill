export type IssuerId = "ondo" | "bstocks" | "xstocks";
export type Side = "buy" | "sell";
export type ExecutionMode = "SWAP" | "RFQ";
/** live = signed Binance Web3 API; preview = keyless public catalog, indicative only. */
export type DataMode = "live" | "preview";

export type MarketStatus =
  | "premarket"
  | "regular"
  | "postmarket"
  | "overnight"
  | "closed"
  | "pause"
  | "unknown";

export interface SessionInfo {
  /** null when the source did not say. */
  open: boolean | null;
  status: MarketStatus;
  reasonCode: string | null;
  reasonMsg: string | null;
  nextOpenTime: number | null;
  nextCloseTime: number | null;
}

/** One tokenized representation of a US stock on BSC. */
export interface StockVersion {
  issuer: IssuerId;
  ticker: string;
  symbol: string;
  address: string;
  chainId: string;
  /** 1 stock, 2 pre-IPO, 3 ETF (other values exist but are undocumented). */
  assetType: number | null;
  /** Underlying shares represented by one token (dividend / split adjusted). */
  shareRatio: number;
  decimals: number;
}

export interface StockListing {
  ticker: string;
  name: string | null;
  versions: StockVersion[];
}

export interface VenueMarket {
  tokenPriceUsd: number | null;
  perSharePriceUsd: number | null;
  priceUpdatedAt: number | null;
  onchainVolume24hUsd: number | null;
  liquidityUsd: number | null;
  holders: number | null;
  session: SessionInfo;
}

export interface RouteOption {
  mode: ExecutionMode;
  vendor: string;
  quoteId: string;
  amountOut: string;
  amountOutDecimal: number;
  priceImpactPct: number | null;
  networkFeeUsd: number | null;
  approveTarget: string | null;
  isBest: boolean;
}

export interface VenueQuote {
  ok: true;
  amountIn: string;
  best: RouteOption;
  routes: RouteOption[];
  quotedAt: number;
}

export interface VenueQuoteError {
  ok: false;
  code: number | string | null;
  message: string;
}

export type ExclusionCode =
  | "HALTED"
  | "NO_LIQUIDITY"
  | "QUOTE_FAILED"
  | "BELOW_MINIMUM"
  | "PRICE_IMPACT"
  | "NEEDS_WALLET"
  | "NO_PRICE"
  | "NOT_HELD";

export interface VenueAssessment {
  version: StockVersion;
  market: VenueMarket;
  quote: VenueQuote | VenueQuoteError | null;
  /** true when the cost comes from a displayed price instead of an executable quote. */
  indicative: boolean;
  /** buy: shares received · sell: shares sold. */
  shares: number | null;
  /** buy: all-in USD paid per share · sell: net USD received per share. */
  effectivePerShareUsd: number | null;
  /** Distance from the fair reference in basis points. Positive = worse for the user. */
  costBps: number | null;
  excluded: { code: ExclusionCode; reason: string } | null;
  flags: VenueFlag[];
}

export type VenueFlag =
  | "stale-price"
  | "thin-liquidity"
  | "rfq-only"
  | "rfq-closed"
  | "market-closed"
  | "corporate-action";

export interface Benchmark {
  priceUsd: number | null;
  source: "us-market" | "onchain-consensus" | "unavailable";
  note: string;
}

export interface OrderRequest {
  ticker: string;
  side: Side;
  /** buy: USDT to spend. */
  amountUsd?: number;
  /** sell: tokens of `issuer` to sell. */
  tokens?: number;
  /** sell: which version the user holds. */
  issuer?: IssuerId;
  /** Wallet that will sign. Required by the Trading API for RFQ quotes. */
  wallet?: string | null;
}

export interface RouteDecision {
  id: string;
  mode: DataMode;
  createdAt: number;
  order: {
    ticker: string;
    side: Side;
    amountUsd: number | null;
    tokens: number | null;
    issuer: IssuerId | null;
    wallet: string | null;
  };
  listing: { ticker: string; name: string | null };
  benchmark: Benchmark;
  session: SessionInfo;
  best: VenueAssessment | null;
  ranked: VenueAssessment[];
  excluded: VenueAssessment[];
  /** How much worse the worst eligible venue is than the best, in bps. */
  spreadBps: number | null;
  explanation: string[];
  warnings: string[];
}

/** Snapshot of the market for one ticker (no order). */
export interface TapeSnapshot {
  mode: DataMode;
  fetchedAt: number;
  listing: StockListing;
  benchmark: Benchmark;
  session: SessionInfo;
  venues: VenueAssessment[];
}

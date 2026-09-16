import type { Web3ApiClient } from "./client";

// Field names follow the official OpenAPI schema (dev-docs/catalog/.../1.0.0/schema.json).

export interface RwaStatusInfo {
  openState?: boolean;
  marketStatus?: string;
  reasonCode?: string | null;
  reasonMsg?: string | null;
  nextOpenTime?: number | null;
  nextCloseTime?: number | null;
}

export interface RwaToken {
  binanceChainId: string;
  tokenContractAddress: string;
  platformId: string;
  assetType: number | null;
  tokenName: string;
  tokenSymbol: string;
  tokenLogoUrl?: string;
  decimals: string | number;
  underlyingTicker: string;
  underlyingName?: string;
  tokenToShareRatio?: string;
  tags?: string[];
  statusInfo?: RwaStatusInfo;
  tokenPrice?: string;
  referencePrice?: string;
  volume24H?: string;
  marketCap?: string;
  peRatioTTM?: string | null;
}

export interface RwaPrice {
  binanceChainId: string;
  tokenContractAddress: string;
  platformId: string;
  tokenPrice: string;
  /** Docs: derived from the on-chain token price — NOT an official stock-market quote. */
  referencePrice: string;
  tokenPriceUpdatedAt: number;
}

export interface RwaSearchResult {
  ticker: string;
  companyName: string;
  assets: { platformId: string; binanceChainId: string; tokenContractAddress: string; tokenSymbol: string; assetType: number }[];
}

export interface RwaUnderlyingMarket {
  statusInfo?: RwaStatusInfo;
  marketData?: {
    referencePrice?: string;
    high52W?: string;
    low52W?: string;
    marketCap?: string;
    peRatioTTM?: string;
    dividendYield?: string;
  };
}

export interface RwaUnderlyingProfile {
  underlyingTicker: string;
  underlyingFullName: string;
  tokenToShareRatio: string;
  protections?: {
    dailyAttestationReport?: { supported: boolean; url?: string };
    monthlyAttestationReport?: { supported: boolean; url?: string };
  };
  companyInfo?: { website?: string | null; industry?: string | null; descriptionEn?: string | null; conceptsEn?: string[] };
}

export interface PriceInfo {
  binanceChainId: string;
  tokenContractAddress: string;
  price: string;
  time: number;
  liquidity?: string;
  holders?: number;
  volume24H?: string;
  buyVolume24H?: string;
  sellVolume24H?: string;
  txs24H?: number;
}

export interface QuoteTokenMeta {
  tokenContractAddress: string;
  tokenSymbol: string;
  tokenUnitPrice?: string;
  decimal: string;
  isHoneyPot?: boolean;
  taxRate?: string;
}

export interface QuoteRoute {
  quoteId: string;
  vendorName: string;
  binanceChainId: string;
  fromTokenAmount: string;
  toTokenAmount: string;
  tradeFee: string | null;
  estimateGasFee: string | null;
  priceImpactPercent: string | null;
  fromToken: QuoteTokenMeta;
  toToken: QuoteTokenMeta;
  executionMode: "SWAP" | "RFQ";
  approveTarget: string | null;
  isBest: boolean;
}

export interface SwapResult {
  routerResult: { vendorName: string; fromTokenAmount: string; toTokenAmount: string; tradeFee: string | null; priceImpactPercent: string | null };
  tx?: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
    maxPriorityFeePerGas?: string | null;
    minReceiveAmount?: string;
    slippagePercent?: string;
  } | null;
  executionMode: "SWAP" | "RFQ";
  rfq?: {
    vendor: "InchFusion" | "CowSwap" | "PcsXRfq";
    txType: "EIP712" | "RAW_TX";
    typedDataToSign: string;
    signingScheme?: string;
    orderId?: string;
  } | null;
}

export interface ApproveTx {
  data: string;
  dexContractAddress: string;
  gasLimit: string;
  gasPrice: string;
}

export interface RfqOrder {
  orderId: string;
  status: "PENDING_VENDOR" | "PENDING_ONCHAIN" | "FILLED" | "FAILED" | "EXPIRED" | "CANCELLED" | string;
  txHash?: string;
  fromAmount?: string;
  toAmount?: string;
  filledAt?: number;
  createdAt?: number;
}

export interface SimulationResult {
  status: string;
  failReason: string | null;
  balanceChanges: { contractAddress: string; tokenType: string; change: string; owner: string }[];
  allowanceChanges?: { tokenAddress: string; owner: string; spender: string; preAmount: string; postAmount: string }[];
}

export interface TxDetail {
  txhash: string;
  txStatus: "success" | "fail" | "pending";
  height: string;
  txTime: string;
  gasUsed: string;
  txFee: string;
  tokenTransferDetails: { from: string; to: string; tokenContractAddress: string; symbol: string; amount: string }[];
}

export interface TokenBalance {
  binanceChainId: string;
  tokenContractAddress: string;
  symbol: string;
  balance: string;
  rawBalance: string;
  tokenPrice: string;
}

const P = {
  rwaTokens: "/api/v1/dex/market/rwa/tokens",
  rwaPrice: "/api/v1/dex/market/rwa/price",
  rwaSearch: "/api/v1/dex/market/rwa/search",
  rwaProfile: "/api/v1/dex/market/rwa/underlying-profile",
  rwaMarket: "/api/v1/dex/market/rwa/underlying-market",
  rwaPlatforms: "/api/v1/dex/market/rwa/platforms",
  priceInfo: "/api/v1/dex/market/price-info",
  candles: "/api/v1/dex/market/candles",
  quote: "/api/v1/dex/aggregator/quote",
  swap: "/api/v1/dex/aggregator/swap",
  approve: "/api/v1/dex/aggregator/approve-transaction",
  rfqSubmit: "/api/v1/dex/aggregator/order/submit",
  rfqOrder: "/api/v1/dex/aggregator/order/",
  gasPrice: "/api/v1/dex/pre-transaction/gas-price",
  simulate: "/api/v1/dex/pre-transaction/simulate",
  broadcast: "/api/v1/dex/pre-transaction/broadcast-transaction",
  txDetail: "/api/v1/dex/post-transaction/transaction-detail-by-txhash",
  balances: "/api/v1/dex/balance/token-balances-by-address",
  b402Supported: "/api/v2/b402/supported",
  b402Verify: "/api/v2/b402/verify",
  b402Settle: "/api/v2/b402/settle",
} as const;

export const ENDPOINTS = P;

export function web3Api(client: Web3ApiClient) {
  return {
    // RWA Data
    rwaTokens: (q: { binanceChainId?: string; platformId?: "ondo" | "bstock"; tabId?: number } = {}) =>
      client.get<RwaToken[]>(P.rwaTokens, q),
    rwaPrice: (binanceChainId: string, addresses: string[]) =>
      client.get<RwaPrice[]>(P.rwaPrice, { binanceChainId, tokenContractAddresses: addresses.slice(0, 100).join(",") }),
    rwaSearch: (keyword: string, platformId?: "ondo" | "bstock") => client.get<RwaSearchResult[]>(P.rwaSearch, { keyword, platformId }),
    rwaProfile: (binanceChainId: string, tokenContractAddress: string) =>
      client.get<RwaUnderlyingProfile>(P.rwaProfile, { binanceChainId, tokenContractAddress }),
    rwaMarket: (binanceChainId: string, tokenContractAddress: string) =>
      client.get<RwaUnderlyingMarket>(P.rwaMarket, { binanceChainId, tokenContractAddress }),
    rwaPlatforms: () => client.get<unknown[]>(P.rwaPlatforms),

    // Market
    priceInfo: (tokens: { binanceChainId: string; tokenContractAddress: string }[]) =>
      client.post<PriceInfo[]>(P.priceInfo, tokens.slice(0, 100), { idempotent: true }),

    /** Rows are [open, high, low, close, volume, timestamp(ms), tradeCount] — a different order from the public K-line feed. */
    candles: (q: { binanceChainId: string; tokenContractAddress: string; bar: string; limit: number }) =>
      client.get<number[][]>(P.candles, q),

    // Trading
    quote:(q: { binanceChainId: string; amount: string; fromTokenAddress: string; toTokenAddress: string; userWalletAddress?: string }) =>
      client.get<QuoteRoute[]>(P.quote, q),
    swap: (q: {
      binanceChainId: string;
      amount: string;
      fromTokenAddress: string;
      toTokenAddress: string;
      userWalletAddress: string;
      quoteId: string;
      slippagePercent?: string;
      autoSlippage?: "true";
    }) => client.get<SwapResult>(P.swap, q),
    approveTx: (q: { binanceChainId: string; tokenContractAddress: string; approveAmount: string; vendor?: string }) =>
      client.get<ApproveTx[]>(P.approve, q),
    submitRfq: (body: { requestId: string; userSignature: string; vendor: string; quoteId: string; signingScheme?: string }) =>
      // Idempotent by requestId for 30 minutes (docs), so retries are safe.
      client.post<RfqOrder>(P.rfqSubmit, body, { idempotent: true }),
    rfqOrder: (orderId: string) => client.get<RfqOrder>(`${P.rfqOrder}${encodeURIComponent(orderId)}`),

    // Transaction
    gasPrice: (binanceChainId: string) => client.get<Record<string, unknown>>(P.gasPrice, { binanceChainId }),
    simulate: (body: { binanceChainId: string; evmTx: { from: string; to: string; value: string; data?: string } }) =>
      client.post<SimulationResult>(P.simulate, body, { idempotent: true }),
    broadcast: (body: { binanceChainId: string; signedTransaction: string; address: string; enableMevProtection?: boolean }) =>
      client.post<{ orderId: string; txHash: string }>(P.broadcast, body),

    // Wallet
    txDetail: (binanceChainId: string, txHash: string) => client.get<TxDetail[]>(P.txDetail, { binanceChainId, txHash }),
    balances: (address: string, tokens: { binanceChainId: string; tokenContractAddress: string }[]) =>
      client.post<{ tokenAssets: TokenBalance[] }[]>(P.balances, { address, tokenContractAddresses: tokens.slice(0, 20) }, { idempotent: true }),

    // B402 (x402 facilitator) — the outer {"body": ...} envelope is part of the signed bytes.
    b402Supported: () => client.post<B402Supported>(P.b402Supported, { body: {} }, { idempotent: true }),
    b402Verify: (inner: unknown) => client.post<B402VerifyResult>(P.b402Verify, { body: inner }, { idempotent: true }),
    // Settle is idempotent for the same signed authorization (docs), but we never auto-retry money movement.
    b402Settle: (inner: unknown) => client.post<B402SettleResult>(P.b402Settle, { body: inner }),
  };
}

export type Web3Api = ReturnType<typeof web3Api>;

export interface B402Kind {
  x402Version: number;
  scheme: string;
  network: string;
  extra: Record<string, unknown> & { assetTransferMethod?: string; name?: string; version?: string };
}

export interface B402Supported {
  kinds: B402Kind[];
  extensions?: unknown;
  signers?: unknown;
}

export interface B402VerifyResult {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
}

export interface B402SettleResult {
  success: boolean;
  transaction?: string;
  payer?: string;
  network?: string;
  amount?: string;
  errorReason?: string;
  errorMessage?: string;
}

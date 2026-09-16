export const BSC_CHAIN_ID = "56";
export const BSC_CAIP2 = "eip155:56";

/** Addresses from the Binance Web3 API docs (B402 production assets, agentic-wallet skill). */
export const TOKENS = {
  BNB: { address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", decimals: 18, symbol: "BNB" },
  USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, symbol: "USDT" },
  USDC: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, symbol: "USDC" },
  U: { address: "0xcE24439F2D9C6a2289F741120FE202248B666666", decimals: 18, symbol: "U" },
  USD1: { address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d", decimals: 18, symbol: "USD1" },
} as const;

/** Ondo requires a whitelisted stablecoin: USDT on BSC (error 40368). We quote every venue against it. */
export const QUOTE_TOKEN = TOKENS.USDT;

/** Trading API quoteId lifetime (docs: ~30 s, QUOTE_EXPIRED 40401). */
export const QUOTE_TTL_MS = 30_000;

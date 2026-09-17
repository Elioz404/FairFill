// Server surface (Node): signed Web3 API client, engine, x402 gate, journal.
export * from "./shared/index";
export { loadConfig, type EngineConfig } from "./config";
export { FairFillEngine, NotConfiguredError, toVenueQuote } from "./engine";
export { Journal, summarize, type JournalEntry, type EndpointStats } from "./journal";
export { Web3ApiClient, Web3ApiError, type KeyIssue } from "./web3api/client";
export { web3Api, ENDPOINTS, type Web3Api } from "./web3api/endpoints";
export { buildQuery, preHash, signPreHash, signRequest, BUILD_PREFIX, WEB3_HOST } from "./web3api/sign";
export { PublicBinance, ICON_HOST } from "./public/binance";
export { X402Gate, encodeHeader, decodeHeader, sameJson, type PaymentRequired, type PaymentRequirement } from "./x402";

import { loadConfig } from "./config";
import { FairFillEngine } from "./engine";

// Next.js can load this module more than once per process (pages and route handlers are bundled
// separately), so the instance lives on globalThis: one cache, one journal, one rate limiter.
const holder = globalThis as typeof globalThis & { __fairfillEngine?: FairFillEngine };

/** One engine per process so caches, the DX journal and request pacing are shared. */
export function getEngine(): FairFillEngine {
  holder.__fairfillEngine ??= new FairFillEngine(loadConfig());
  return holder.__fairfillEngine;
}

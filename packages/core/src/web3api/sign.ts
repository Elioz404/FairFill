import { createHmac } from "node:crypto";

// Docs: https://web3.binance.com/en/dev-docs/authentication
export const WEB3_HOST = "https://web3.binance.com";
/** Part of the signed requestPath — omitting it is the #1 cause of 40102. */
export const BUILD_PREFIX = "/build";

export type QueryValue = string | number | boolean | null | undefined;

/** Raw wire encoding: encodeURIComponent (spaces → %20), insertion order kept. */
export function buildQuery(params: Record<string, QueryValue> = {}): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

export function preHash(timestamp: string, method: string, requestPath: string, body: string): string {
  return timestamp + method.toUpperCase() + requestPath + body;
}

export function signPreHash(secretKey: string, value: string): string {
  return createHmac("sha256", secretKey).update(value, "utf8").digest("base64");
}

export interface SignedRequest {
  url: string;
  requestPath: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export function signRequest(opts: {
  apiKey: string;
  secretKey: string;
  method: "GET" | "POST";
  /** API path without the /build prefix, e.g. /api/v1/dex/market/rwa/tokens */
  path: string;
  query?: Record<string, QueryValue>;
  /** Exact JSON string that will be sent. */
  body?: string;
  timestamp?: string;
  recvWindowMs?: number;
}): SignedRequest {
  const qs = buildQuery(opts.query);
  const requestPath = `${BUILD_PREFIX}${opts.path}${qs ? `?${qs}` : ""}`;
  const timestamp = opts.timestamp ?? new Date().toISOString();
  const body = opts.method === "GET" ? "" : (opts.body ?? "");
  const signature = signPreHash(opts.secretKey, preHash(timestamp, opts.method, requestPath, body));
  const headers: Record<string, string> = {
    "X-OC-APIKEY": opts.apiKey,
    "X-OC-TIMESTAMP": timestamp,
    "X-OC-SIGN": signature,
  };
  if (opts.recvWindowMs) headers["X-OC-RECV-WINDOW"] = String(opts.recvWindowMs);
  if (opts.method === "POST") headers["Content-Type"] = "application/json";
  return {
    url: `${WEB3_HOST}${requestPath}`,
    requestPath,
    headers,
    body: opts.method === "POST" ? body : undefined,
  };
}

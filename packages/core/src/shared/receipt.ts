import type { IssuerId, Side } from "./types";

/**
 * Everything a receipt needs to judge a fill later, carried in the URL so
 * receipts stay shareable without a database.
 */
export interface ReceiptSnapshot {
  v: 1;
  ticker: string;
  side: Side;
  issuer: IssuerId;
  symbol: string;
  address: string;
  decimals: number;
  shareRatio: number;
  amountUsd: number | null;
  tokens: number | null;
  expectedShares: number | null;
  expectedCostBps: number | null;
  benchmarkUsd: number | null;
  benchmarkSource: string;
  alternatives: { symbol: string; issuer: IssuerId; costBps: number | null; excluded: string | null }[];
  decidedAt: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function encodeReceipt(snapshot: ReceiptSnapshot): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(snapshot)));
}

export function decodeReceipt(encoded: string): ReceiptSnapshot | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as ReceiptSnapshot;
    return parsed && parsed.v === 1 && typeof parsed.ticker === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Realised cost vs the reference captured at decision time. Positive = worse for the user. */
export function realisedCostBps(snapshot: ReceiptSnapshot, filled: { tokensOut?: number; usdOut?: number }): number | null {
  const ref = snapshot.benchmarkUsd;
  if (!ref) return null;
  if (snapshot.side === "buy" && snapshot.amountUsd && filled.tokensOut) {
    const perShare = snapshot.amountUsd / (filled.tokensOut * snapshot.shareRatio);
    return (perShare / ref - 1) * 10_000;
  }
  if (snapshot.side === "sell" && snapshot.tokens && filled.usdOut) {
    const perShare = filled.usdOut / (snapshot.tokens * snapshot.shareRatio);
    return (1 - perShare / ref) * 10_000;
  }
  return null;
}

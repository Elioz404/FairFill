import type { IssuerId, OrderRequest } from "@fairfill/core";
import { isAddress, positiveNumber } from "./server";

const ISSUER_IDS: IssuerId[] = ["bstocks", "ondo", "xstocks"];

/** Parse an order from JSON or query params. Throws with a human message. */
export function parseOrder(input: Record<string, unknown>): OrderRequest {
  const ticker = typeof input.ticker === "string" ? input.ticker.trim().toUpperCase() : "";
  if (!/^[A-Z0-9.]{1,12}$/.test(ticker)) throw new Error("ticker is required (e.g. AAPL)");
  const side = input.side === "sell" ? "sell" : input.side === "buy" || input.side === undefined ? "buy" : null;
  if (!side) throw new Error("side must be buy or sell");
  const wallet = input.wallet === undefined || input.wallet === null || input.wallet === "" ? null : input.wallet;
  if (wallet !== null && !isAddress(wallet)) throw new Error("wallet must be a 0x address");

  if (side === "buy") {
    const amountUsd = positiveNumber(input.amountUsd);
    if (amountUsd === null) throw new Error("amountUsd must be a positive number");
    if (amountUsd > 100_000) throw new Error("amountUsd is capped at 100,000 in this demo");
    return { ticker, side, amountUsd, wallet };
  }
  const tokens = positiveNumber(input.tokens);
  if (tokens === null) throw new Error("tokens must be a positive number");
  const issuer = ISSUER_IDS.find((id) => id === input.issuer);
  if (!issuer) throw new Error("issuer must be one of bstocks, ondo, xstocks");
  return { ticker, side, tokens, issuer, wallet };
}

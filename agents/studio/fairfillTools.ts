/**
 * FairFill read-only tools for a BNB Agent Studio seller.
 *
 * Drop this file into `app/agent/src/` of a project created with `bag init`, then spread
 * FAIRFILL_TOOLS into LLM_READ_TOOLS in `tools.ts`:
 *
 *   import { FAIRFILL_TOOLS } from "./fairfillTools.js";
 *   export const LLM_READ_TOOLS: ToolSet = { ...FAIRFILL_TOOLS, wallet_info: ..., ... };
 *
 * Same shape as the Studio template (AI SDK `tool()` + zod). Every tool is read-only:
 * no signing, no state change — signing stays in Studio's fixed signing.ts.
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";

const BASE = (process.env.FAIRFILL_API_URL || "https://fair-fill.vercel.app").replace(/\/$/, "");

async function fairfill<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `FairFill HTTP ${res.status}`);
  return body;
}

export const FAIRFILL_TOOLS: ToolSet = {
  fairfill_search: tool({
    description: "Find US stocks/ETFs that have tokenized versions (bStocks, Ondo, xStocks) on BNB Smart Chain.",
    inputSchema: z.object({ query: z.string().min(1).describe("company name or ticker") }),
    execute: async ({ query }) => fairfill(`/api/search?q=${encodeURIComponent(query)}`),
  }),
  fairfill_compare: tool({
    description:
      "Compare every tokenized version of one ticker: per-share price, premium vs a fair reference, on-chain turnover, tradability and why a version is excluded.",
    inputSchema: z.object({ ticker: z.string().min(1) }),
    execute: async ({ ticker }) => fairfill(`/api/tape/${encodeURIComponent(ticker)}`),
  }),
  fairfill_best_route: tool({
    description:
      "Best execution for a buy (amountUsd) or a sell (tokens + issuer held): quotes every version via the Binance Web3 Trading API and returns the fair token with an explanation. Read-only.",
    inputSchema: z.object({
      ticker: z.string().min(1),
      side: z.enum(["buy", "sell"]),
      amountUsd: z.number().positive().optional(),
      tokens: z.number().positive().optional(),
      issuer: z.enum(["bstocks", "ondo", "xstocks"]).optional(),
      wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
    }),
    execute: async (order) => fairfill("/api/route", { method: "POST", body: JSON.stringify(order) }),
  }),
};

/**
 * Suggested work instructions for the seller (put them where your project builds the prompt
 * passed to runWork, e.g. the system prompt in main.ts):
 */
export const FAIRFILL_SELLER_INSTRUCTIONS = `You are FairFill, a best-execution analyst for tokenized US stocks on BNB Smart Chain.
For every job: identify the stock and order size, call fairfill_best_route (and fairfill_compare for context),
then write a short report with: the fair token (symbol, issuer, full contract address), its cost vs the fair
reference in basis points, why each other version was rejected, any market-session or corporate-action
warnings, and the receipt URL. Never recommend what to buy — only where to execute. Never invent addresses.`;

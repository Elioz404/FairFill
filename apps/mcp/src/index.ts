/**
 * FairFill MCP server (stdio). Read-only: it never signs or broadcasts.
 * Local mode runs the engine with the keys in the repo-root .env;
 * remote mode (FAIRFILL_API_URL) proxies a FairFill deployment.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ISSUERS, TOKENS, describeSession, encodeReceipt, getEngine, type RouteDecision, type TapeSnapshot } from "@fairfill/core";
import { z } from "zod";

// stdout belongs to the MCP protocol: load config silently and keep logs on stderr.
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const envFile = path.join(repoRoot, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.FAIRFILL_JOURNAL_DIR ??= path.join(repoRoot, ".dx-journal");

const remote = process.env.FAIRFILL_API_URL?.replace(/\/$/, "") || null;
const engine = remote ? null : getEngine();
const baseUrl = remote ?? engine?.config.baseUrl ?? "http://localhost:3000";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${remote}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const failure = (error: unknown) => ({ ...text(`Error: ${error instanceof Error ? error.message : String(error)}`), isError: true });

function summarizeTape(t: TapeSnapshot) {
  return {
    ticker: t.listing.ticker,
    name: t.listing.name,
    dataMode: t.mode,
    session: describeSession(t.session),
    fairReference: t.benchmark,
    versions: t.venues.map((v) => ({
      issuer: ISSUERS[v.version.issuer].label,
      symbol: v.version.symbol,
      tokenAddress: v.version.address,
      execution: ISSUERS[v.version.issuer].executionLabel,
      perSharePriceUsd: v.market.perSharePriceUsd,
      premiumBps: v.costBps,
      onchainVolume24hUsd: v.market.onchainVolume24hUsd,
      tradable: v.excluded === null,
      note: v.excluded?.reason ?? null,
    })),
  };
}

function summarizeDecision(d: RouteDecision, receipt: string | null) {
  const best = d.best;
  const side = d.order.side;
  const qty = side === "buy" ? d.order.amountUsd : d.order.tokens;
  const from = best ? (side === "buy" ? TOKENS.USDT.address : best.version.address) : null;
  const to = best ? (side === "buy" ? best.version.address : TOKENS.USDT.address) : null;
  return {
    ticker: d.listing.ticker,
    side,
    dataMode: d.mode,
    best: best
      ? {
          issuer: ISSUERS[best.version.issuer].label,
          symbol: best.version.symbol,
          tokenAddress: best.version.address,
          costVsReferenceBps: best.costBps,
          shares: best.shares,
          indicative: best.indicative,
        }
      : null,
    explanation: d.explanation,
    warnings: d.warnings,
    // The Binance Agentic Wallet skill executes this after the user confirms.
    agenticWallet: best
      ? {
          quote: `baw market-order quote --fromTokenQty ${qty} --fromToken ${from} --toToken ${to} --binanceChainId 56 --json`,
          swap: `baw market-order swap --fromTokenQty ${qty} --fromToken ${from} --toToken ${to} --binanceChainId 56 --json`,
          poll: "baw market-order list --orderId <orderId> --json",
        }
      : null,
    receiptUrl: receipt ? `${baseUrl}/receipt?d=${receipt}` : null,
  };
}

const server = new McpServer({ name: "fairfill", version: "0.1.0" });
const readOnly = { readOnlyHint: true, openWorldHint: true } as const;

server.registerTool(
  "fairfill_search",
  {
    title: "Find a tokenized stock",
    description: "Search US stocks and ETFs that have tokenized versions (bStocks, Ondo, xStocks) on BNB Smart Chain. Accepts company names or tickers.",
    inputSchema: { query: z.string().min(1).describe("Company name or ticker, e.g. 'apple' or 'NVDA'") },
    annotations: readOnly,
  },
  async ({ query }) => {
    try {
      if (remote) return text(await http(`/api/search?q=${encodeURIComponent(query)}`));
      const results = await engine!.search(query, 10);
      return text(results.map((l) => ({ ticker: l.ticker, name: l.name, versions: l.versions.map((v) => `${v.symbol} (${ISSUERS[v.issuer].label})`) })));
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "fairfill_compare",
  {
    title: "Compare every version of a stock",
    description:
      "Per-share price, premium vs a fair reference, on-chain turnover and tradability of each tokenized version of one ticker on BSC. Flags stale prices that only look like discounts.",
    inputSchema: { ticker: z.string().min(1).describe("Underlying ticker, e.g. AAPL") },
    annotations: readOnly,
  },
  async ({ ticker }) => {
    try {
      const tape = remote ? await http<TapeSnapshot>(`/api/tape/${encodeURIComponent(ticker)}`) : await engine!.tape(ticker);
      if (!tape) return failure(`Unknown ticker ${ticker}`);
      return text(summarizeTape(tape));
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "fairfill_best_route",
  {
    title: "Best execution for an order",
    description:
      "Quotes every version of the stock with the Binance Web3 Trading API and returns the fair one with an explanation and the exact Binance Agentic Wallet (baw) commands. Does not execute anything. For sells, pass the issuer you hold.",
    inputSchema: {
      ticker: z.string().min(1),
      side: z.enum(["buy", "sell"]).default("buy"),
      amountUsd: z.number().positive().optional().describe("Buy: USDT to spend"),
      tokens: z.number().positive().optional().describe("Sell: tokens to sell"),
      issuer: z.enum(["bstocks", "ondo", "xstocks"]).optional().describe("Sell: which version you hold"),
      wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional().describe("Wallet that will sign; needed to quote RFQ venues such as Ondo"),
    },
    annotations: readOnly,
  },
  async (args) => {
    try {
      if (remote) {
        const body = await http<{ decision: RouteDecision; receipt: string | null }>("/api/route", { method: "POST", body: JSON.stringify(args) });
        return text(summarizeDecision(body.decision, body.receipt));
      }
      const decision = await engine!.route({ ...args, ticker: args.ticker.toUpperCase() });
      const snapshot = engine!.receiptFor(decision);
      return text(summarizeDecision(decision, snapshot ? encodeReceipt(snapshot) : null));
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "fairfill_session",
  {
    title: "US market session",
    description: "Whether the US equity session is open, with next open/close times. RFQ venues (Ondo, bStocks RFQ) only quote while it is open.",
    inputSchema: {},
    annotations: readOnly,
  },
  async () => {
    try {
      if (remote) {
        const tape = await http<TapeSnapshot>("/api/tape/SPY");
        return text({ ...describeSession(tape.session), raw: tape.session });
      }
      const session = await engine!.marketSession();
      return text({ ...describeSession(session), raw: session });
    } catch (error) {
      return failure(error);
    }
  },
);

await server.connect(new StdioServerTransport());

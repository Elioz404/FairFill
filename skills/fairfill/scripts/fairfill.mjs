#!/usr/bin/env node
// FairFill skill CLI — read-only client for a FairFill deployment. No dependencies.
//   node fairfill.mjs search <query>
//   node fairfill.mjs compare <TICKER>
//   node fairfill.mjs route <TICKER> buy <usd> [wallet]
//   node fairfill.mjs route <TICKER> sell <tokens> <bstocks|ondo|xstocks> [wallet]

const BASE = (process.env.FAIRFILL_API_URL || "https://fair-fill.vercel.app").replace(/\/$/, "");
const USDT = "0x55d398326f99059fF775485246999027B3197955";

async function call(path, init) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

const print = (value) => console.log(JSON.stringify(value, null, 2));

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "search") {
    print(await call(`/api/search?q=${encodeURIComponent(args.join(" "))}`));
  } else if (cmd === "compare") {
    const tape = await call(`/api/tape/${encodeURIComponent(args[0] ?? "")}`);
    print({
      ticker: tape.listing.ticker,
      name: tape.listing.name,
      dataMode: tape.mode,
      fairReference: tape.benchmark,
      session: tape.session,
      versions: tape.venues.map((v) => ({
        symbol: v.version.symbol,
        issuer: v.version.issuer,
        tokenAddress: v.version.address,
        perSharePriceUsd: v.market.perSharePriceUsd,
        premiumBps: v.costBps,
        onchainVolume24hUsd: v.market.onchainVolume24hUsd,
        tradable: v.excluded === null,
        note: v.excluded ? v.excluded.reason : null,
      })),
    });
  } else if (cmd === "route") {
    const [ticker, side = "buy", qty, fourth, fifth] = args;
    const body =
      side === "sell"
        ? { ticker, side, tokens: Number(qty), issuer: fourth, wallet: fifth }
        : { ticker, side: "buy", amountUsd: Number(qty), wallet: fourth };
    const { decision, receipt } = await call("/api/route", { method: "POST", body: JSON.stringify(body) });
    const best = decision.best;
    const from = best ? (side === "sell" ? best.version.address : USDT) : null;
    const to = best ? (side === "sell" ? USDT : best.version.address) : null;
    print({
      ticker: decision.listing.ticker,
      side: decision.order.side,
      dataMode: decision.mode,
      best: best && {
        symbol: best.version.symbol,
        issuer: best.version.issuer,
        tokenAddress: best.version.address,
        costVsReferenceBps: best.costBps,
        shares: best.shares,
        indicative: best.indicative,
      },
      explanation: decision.explanation,
      warnings: decision.warnings,
      agenticWallet: best && {
        quote: `baw market-order quote --fromTokenQty ${qty} --fromToken ${from} --toToken ${to} --binanceChainId 56 --json`,
        swap: `baw market-order swap --fromTokenQty ${qty} --fromToken ${from} --toToken ${to} --binanceChainId 56 --json`,
      },
      receiptUrl: receipt ? `${BASE}/receipt?d=${receipt}` : null,
    });
  } else {
    console.error("usage: fairfill.mjs search <q> | compare <TICKER> | route <TICKER> buy <usd> [wallet] | route <TICKER> sell <tokens> <issuer> [wallet]");
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(`fairfill: ${error.message}`);
  process.exit(1);
});

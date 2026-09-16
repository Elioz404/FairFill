/**
 * Read-only smoke test against the live Binance Web3 API.
 * Nothing is signed on-chain, nothing is broadcast, nothing is settled.
 *
 *   pnpm smoke            (reads ../../.env)
 *   pnpm smoke NVDA 25    (ticker, USD size for the quotes)
 */
import { FairFillEngine, loadConfig, summarize, BSC_CHAIN_ID, QUOTE_TOKEN, toBaseUnits, fmtBps } from "../src/index";

const [ticker = "AAPL", size = "25"] = process.argv.slice(2);
const config = loadConfig();
const engine = new FairFillEngine({ ...config, journal: { ...config.journal, dir: "../../.dx-journal" } });

type Step = { name: string; run: () => Promise<unknown> };
const results: { name: string; ok: boolean; detail: string }[] = [];

async function main() {
  console.log(`FairFill smoke · mode=${engine.mode} · ticker=${ticker} · size=$${size}\n`);
  const listing = await engine.listing(ticker);
  if (!listing) throw new Error(`Ticker ${ticker} is not in the catalog`);
  console.log(`Catalog: ${listing.versions.map((v) => `${v.symbol} (${v.issuer})`).join(", ")}\n`);

  const steps: Step[] = [];
  const api = engine.api;
  if (api) {
    const first = listing.versions.find((v) => v.issuer !== "xstocks") ?? listing.versions[0]!;
    steps.push(
      { name: "RWA Data · platforms", run: () => api.rwaPlatforms() },
      { name: "RWA Data · search", run: () => api.rwaSearch(ticker) },
      { name: "RWA Data · tokens (BSC)", run: async () => (await api.rwaTokens({ binanceChainId: BSC_CHAIN_ID })).length + " tokens" },
      { name: "RWA Data · price", run: () => api.rwaPrice(BSC_CHAIN_ID, listing.versions.map((v) => v.address)) },
      { name: "RWA Data · underlying-market", run: () => api.rwaMarket(BSC_CHAIN_ID, first.address) },
      { name: "RWA Data · underlying-profile", run: () => api.rwaProfile(BSC_CHAIN_ID, first.address) },
      { name: "Market · price-info", run: () => api.priceInfo(listing.versions.map((v) => ({ binanceChainId: BSC_CHAIN_ID, tokenContractAddress: v.address }))) },
      { name: "Transaction · gas-price", run: () => api.gasPrice(BSC_CHAIN_ID) },
    );
    for (const v of listing.versions) {
      steps.push({
        name: `Trading · quote USDT→${v.symbol}`,
        run: () =>
          api.quote({
            binanceChainId: BSC_CHAIN_ID,
            amount: toBaseUnits(size, QUOTE_TOKEN.decimals),
            fromTokenAddress: QUOTE_TOKEN.address,
            toTokenAddress: v.address,
            userWalletAddress: config.quoteWallet ?? undefined,
          }),
      });
    }
    if (config.quoteWallet) {
      steps.push({ name: "Wallet · token balances", run: () => api.balances(config.quoteWallet!, [{ binanceChainId: BSC_CHAIN_ID, tokenContractAddress: QUOTE_TOKEN.address }]) });
    }
    if (config.x402.payTo) {
      steps.push({ name: "B402 · supported", run: () => api.b402Supported() });
    }
  } else {
    console.log("No API keys found: only the public catalog and the preview router are exercised.\n");
  }

  steps.push({
    name: `FairFill · route buy $${size} ${ticker}`,
    run: async () => {
      const d = await engine.route({ ticker, side: "buy", amountUsd: Number(size) });
      return [d.best ? `best=${d.best.version.symbol} ${fmtBps(d.best.costBps)}` : "no fill", ...d.explanation].join("\n    ");
    },
  });

  for (const step of steps) {
    const started = Date.now();
    try {
      const value = await step.run();
      const detail = typeof value === "string" ? value : JSON.stringify(value).slice(0, 220);
      results.push({ name: step.name, ok: true, detail });
      console.log(`PASS ${step.name} (${Date.now() - started} ms)\n    ${detail}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ name: step.name, ok: false, detail });
      console.log(`FAIL ${step.name} (${Date.now() - started} ms)\n    ${detail}`);
    }
  }

  console.log("\nLatency by endpoint (this run):");
  for (const s of summarize(engine.journal.recent())) {
    console.log(`  ${s.endpoint.padEnd(62)} calls=${s.calls} errors=${s.errors} p50=${s.p50}ms p95=${s.p95}ms`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} steps passed. Raw log: .dx-journal/journal.jsonl`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

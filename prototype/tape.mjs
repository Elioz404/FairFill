#!/usr/bin/env node
// Consolidated tape prototype: compares the Ondo, xStocks and bStocks versions of the
// same US ticker on BSC and flags venues whose price is not executable.
//
// Uses only the public endpoints that the official Binance Wallet Skills call
// (no API key). The real product replaces them with the signed Web3 API
// (RWA Data + Trading API quotes), which is what the hackathon scores.
//
// Usage: node prototype/tape.mjs NVDA TSLA AAPL

const CHAIN_ID = "56";
const HOST = "https://www.binance.com/bapi/defi";
const HEADERS = { "Accept-Encoding": "identity", "User-Agent": "binance-web3/1.1 (Skill)" };
const PROVIDERS = [
  { type: 1, name: "Ondo" },
  { type: 3, name: "bStocks" },
  { type: 2, name: "xStocks" },
];
// Below this 24h on-chain turnover (USD) a displayed price is treated as stale.
const MIN_ONCHAIN_VOLUME_USD = 1_000;

async function getJson(path) {
  const res = await fetch(`${HOST}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  const body = await res.json();
  if (!body.success) throw new Error(`API error ${body.code} ${path}`);
  return body.data;
}

const tokenList = (type) =>
  getJson(`/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai?type=${type}`);
const rwaDynamic = (addr) =>
  getJson(`/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai?chainId=${CHAIN_ID}&contractAddress=${addr}`);
const tokenDynamic = (addr) =>
  getJson(`/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info/ai?chainId=${CHAIN_ID}&contractAddress=${addr}`);
const marketStatus = () =>
  getJson(`/v1/public/wallet-direct/buw/wallet/market/token/rwa/market/status/ai`);

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const fmt = (v, d = 2) => (v === null || Number.isNaN(v) ? "—" : v.toFixed(d));

async function scanTicker(ticker, lists) {
  const rows = [];
  for (const { type, name } of PROVIDERS) {
    const token = lists.get(type).get(ticker);
    if (!token) {
      rows.push({ name, symbol: "—", verdict: "NOT LISTED" });
      continue;
    }
    const [rwa, dyn] = await Promise.all([rwaDynamic(token.contractAddress), tokenDynamic(token.contractAddress)]);
    const tokenPrice = num(rwa?.tokenInfo?.price);
    const multiplier = num(rwa?.tokenInfo?.sharesMultiplier) ?? num(token.multiplier) ?? 1;
    const perShare = tokenPrice !== null ? tokenPrice / multiplier : null;
    const onchainVolume = (num(dyn?.volume24hBuy) ?? 0) + (num(dyn?.volume24hSell) ?? 0);
    const reason = rwa?.statusInfo?.reasonCode;
    let verdict = "OK";
    if (reason && reason !== "TRADING") verdict = `HALTED (${reason})`;
    else if (onchainVolume < MIN_ONCHAIN_VOLUME_USD) verdict = "STALE PRICE / NO LIQUIDITY";
    rows.push({
      name,
      symbol: token.symbol,
      address: token.contractAddress,
      perShare,
      stockPrice: num(rwa?.stockInfo?.price),
      onchainVolume,
      holders: num(dyn?.holders),
      verdict,
    });
  }
  const reference = rows.map((r) => r.stockPrice).find((p) => p) ?? null;
  console.log(`\n${ticker}  (US reference: ${fmt(reference)} USD)`);
  console.log("provider  symbol    per-share   vs ref (bps)   24h on-chain USD   holders   verdict");
  for (const r of rows) {
    const bps = r.perShare && reference ? ((r.perShare / reference - 1) * 10_000).toFixed(0) : "—";
    console.log(
      `${r.name.padEnd(9)} ${String(r.symbol).padEnd(9)} ${fmt(r.perShare).padStart(9)}   ${String(bps).padStart(12)}   ` +
        `${fmt(r.onchainVolume ?? null, 0).padStart(16)}   ${String(r.holders ?? "—").padStart(7)}   ${r.verdict}`,
    );
  }
}

async function main() {
  const tickers = process.argv.slice(2).map((t) => t.toUpperCase());
  if (tickers.length === 0) tickers.push("NVDA", "TSLA", "AAPL", "SPY");

  const lists = new Map();
  for (const { type } of PROVIDERS) {
    const items = await tokenList(type);
    lists.set(type, new Map(items.filter((i) => i.chainId === CHAIN_ID).map((i) => [i.ticker, i])));
  }
  const status = await marketStatus();
  // `offhours` is undocumented: it may be a closed window or a weekend session. Printed raw on purpose.
  const offhours = status.offhours
    ? `offhours open=${status.offhours.openState} ${new Date(status.offhours.nextOpenTime).toISOString()} → ${new Date(status.offhours.nextCloseTime).toISOString()}`
    : "no offhours field";
  console.log(`Ondo market: ${status.marketStatus} (open=${status.openState}); ${offhours}`);
  console.log(
    `Listed on BSC: Ondo ${lists.get(1).size} · bStocks ${lists.get(3).size} · xStocks ${lists.get(2).size}`,
  );

  for (const ticker of tickers) await scanTicker(ticker, lists);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

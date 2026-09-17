# FairFill — best execution for tokenized stocks on BNB Chain

> **Apple exists three times on BNB Chain. FairFill makes sure you buy the right one.**

The same US stock trades on BSC as a **bStocks** token (`AAPLB`), an **Ondo** token (`AAPLon`) and an
**xStocks** token (`AAPLx`). They differ in price, trading hours, liquidity, execution mechanism (AMM vs RFQ),
minimum size and token-to-share ratio. Your broker is required to give you best execution. On-chain, nobody does.

FairFill quotes every version, throws out the ones that cannot really fill, explains the choice in plain
words, executes the fair one with the **Binance Agentic Wallet** (or your browser wallet), and hands you a
receipt that shows what you paid against a fair reference. Agents get the same engine through a **skill**,
an **MCP server**, a **pay-per-route x402 endpoint** settled by **B402**, and a **BNB Agent Studio** seller.

Built for **BNB Hack: Tokenized Stocks Edition** (main track and both special prizes).

---

## Why this matters — measured, not assumed

Snapshot from the public Binance feeds on 2026-09-16 (US regular session):

| Ticker | Version | Per share | vs US price | 24h on-chain turnover | Verdict |
|---|---|---|---|---|---|
| NVDA | NVDAB (bStocks) | $216.34 | +32 bps | $4.9M | tradable |
| NVDA | NVDAon (Ondo) | $216.13 | +22 bps | $85.7k | tradable |
| NVDA | NVDAx (xStocks) | $211.72 | **−182 bps** | **$0** | **stale price** |
| COIN | COINon (Ondo) | $167.49 | +69 bps | $784k | tradable |
| COIN | COINB (bStocks) | $167.56 | +73 bps | $6.5k | thin |
| COIN | COINx (xStocks) | $175.49 | **+549 bps** | **$0** | **stale price** |

- **The liquid version changes by ticker** (AAPL and NVDA → bStocks, COIN → Ondo).
- **xStocks pools on BSC show zero turnover.** A naive spread monitor sees a 1.8% "discount" that cannot be executed.
- **RFQ venues close with the US market** (Ondo `40367`, bStocks RFQ `40369`), while AMM routes keep trading.
- Catalog: **510 tickers on BSC, 116 with two or more versions, 37 in all three.**

Reproduce with `node prototype/tape.mjs NVDA COIN`.

## How it works

```
"Buy $20 of Apple"
  1. Understand      RWA Data · search / catalog        → AAPLB, AAPLon, AAPLx
  2. Check sessions  RWA Data · underlying-market        → open? halted? corporate action?
  3. Quote them all  Trading API · quote (SWAP + RFQ)    → same size, same stablecoin (USDT)
  4. Normalize       RWA Data · tokens, Market · price-info → per share, share ratio, network fee, fair reference
  5. Simulate & fill Transaction API · simulate → Agentic Wallet (baw) or browser wallet (+ RFQ submit)
  6. Receipt         Wallet API · tx detail / RFQ order status → realised cost vs reference and vs alternatives
```

Exclusion rules are explicit and tested (`packages/core/test/rank.test.ts`): corporate-action halts, RFQ venues
while the market is closed, stale prices (on-chain turnover below a threshold), documented Trading API errors
(`40367`, `40369`, `40375`, `40366`, `40421`, `40374`), missing wallet for RFQ quotes, excessive price impact
and honeypot flags.

**Fair reference.** The RWA Data API documents `referencePrice` as *derived from the on-chain token price, not an
official quote*, so FairFill uses the live US-market price from Binance's public stock feed when available and
otherwise the median per-share price of the versions that actually trade.

## Binance Web3 API and AI stack coverage

| Module | Endpoints used | Where |
|---|---|---|
| RWA Data | `rwa/tokens`, `rwa/underlying-market`, `rwa/platforms` (app) · `rwa/price`, `rwa/search`, `rwa/underlying-profile` (smoke test) | catalog, sessions, prices |
| Market | `market/price-info` (batched up to 100 tokens), `market/candles` | liquidity, on-chain volume, holders, price history |
| Trading | `aggregator/quote`, `aggregator/swap`, `aggregator/approve-transaction`, `aggregator/order/submit`, `aggregator/order/{id}` | routing, SWAP + RFQ execution |
| Transaction | `pre-transaction/simulate` (app) · `pre-transaction/gas-price` (smoke test) | dry-run before signing |
| Wallet | `post-transaction/transaction-detail-by-txhash` (receipts) · `balance/token-balances-by-address` (smoke test) | receipts, checks |
| b402 Payments | `v2/b402/supported`, `v2/b402/verify`, `v2/b402/settle` (+ Bazaar metadata) | paid route for agents |
| Agentic Wallet / Wallet Skills | `baw market-order quote/swap/list`, `baw wallet address`, `baw x402-payment preview/sign` | execution skill |
| BNB Agent Studio | seller with ERC-8004 identity, ERC-8183 jobs, x402 face | `agents/studio` |

Every call goes through a signed HMAC client (`/build` prefix included in the signature) and is recorded by the
**DX journal** — latency, HTTP status and the exact business code and message — visible at `/log`.

## Surfaces

| Surface | Path | What it does |
|---|---|---|
| Web app | `apps/web` | Search → consolidated tape → per-stock versions → order ticket → execution → receipt |
| Skill | `skills/fairfill` | Teaches any shell-capable agent to route with FairFill and fill with `baw` |
| MCP server | `apps/mcp` | `fairfill_search`, `fairfill_compare`, `fairfill_best_route`, `fairfill_session` (read-only) |
| Paid API | `GET /api/x402/route` | x402 v2 (exact, U via EIP-3009, BSC) verified and settled by B402 |
| Agent Studio | `agents/studio` | Seller agent that sells best-execution reports; also buys FairFill routes with `bag x402 buy` |
| Engine | `packages/core` | Signed Web3 API client, ranking, x402 gate, receipts, DX journal (unit-tested) |

## Quick start

Requirements: Node.js ≥ 22.12, pnpm 10.

```bash
pnpm install
cp .env.example .env        # add BINANCE_WEB3_API_KEY / BINANCE_WEB3_SECRET_KEY for live mode
pnpm dev                    # http://localhost:3000
```

Without keys the app runs in **preview mode**: keyless public catalog, indicative prices, no execution.

```bash
pnpm test                   # engine unit tests
pnpm smoke AAPL 25          # read-only check of every live endpoint + latency table
pnpm tape                   # prototype: live cross-issuer tape from public data
pnpm build                  # production build (type-checked)
```

### Deploy (Vercel)

1. Import the GitHub repository in Vercel and set **Root Directory** to `apps/web`. Vercel detects the pnpm
   workspace from the root lockfile.
2. Add the environment variables from `.env.example` (at least `BINANCE_WEB3_API_KEY` and
   `BINANCE_WEB3_SECRET_KEY`). `FAIRFILL_BASE_URL` is optional: it defaults to the production domain.
3. Deploy. `apps/web/vercel.json` pins the functions to `sin1` (Singapore).

The region matters: the Binance Web3 API checks the server IP and blocks, among others, the United States,
Canada, the Netherlands, the United Kingdom and Japan
([list](https://web3.binance.com/en/dev-docs/web3-api-prohibited-regions)). Vercel's default region is in
the US. After deploying, `GET /api/health` reports `mode`, `keyIssue` and the `region` the request ran in; a
`keyIssue` such as `40301` or `40302` means the server location is being rejected, and `fra1` (Frankfurt)
is the alternative to try.

On the free plan, live data pauses after five minutes without user activity and resumes on the next
interaction, so an idle tab does not use up the monthly function quota.

### Agents

```bash
# Binance Agentic Wallet + FairFill skills
npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet
npx skills add <github-user>/<this-repo>/skills/fairfill

# MCP server (stdio) — the command any MCP client should launch
pnpm -s --dir /path/to/repo mcp
```

Example client entry (`mcp.json` style):

```json
{ "mcpServers": { "fairfill": { "command": "pnpm", "args": ["-s", "--dir", "/path/to/repo", "mcp"] } } }
```

### BNB Agent Studio seller

`agents/studio/fairfillTools.ts` holds read-only AI SDK tools for a Studio seller that sells best-execution
reports (flags read from `@bnbagent/studio-cli` 0.0.13; re-check with `bag init --help`).

```bash
npm install --global @bnbagent/studio-cli
bag init fairfillagent --protocols A2A,MCP,X402 --rails both --b402-price 0.01 --network bsc-testnet
# copy agents/studio/fairfillTools.ts into app/agent/src/ and spread FAIRFILL_TOOLS into LLM_READ_TOOLS (tools.ts)
bag env set FAIRFILL_API_URL https://<your-fairfill-deployment>
bag dev                                  # local run: A2A :9000, MCP :8000/mcp, /x402
bag deploy --provider bnb                # managed 48 h testnet trial
bag deploy verify --provider bnb         # reconcile the endpoint with the ERC-8004 identity
bag x402 buy "https://<your-fairfill-deployment>/api/x402/route?ticker=AAPL&side=buy&amountUsd=20" --max-usd 0.02
```

The last command shows the reverse direction: a Studio agent paying FairFill's own x402 route with U over EIP-3009.

### Paid route (x402 v2 + B402)

1. Complete B402 onboarding in the Developer Portal and create an API key with the **B402 Payments** permission.
2. Set `FAIRFILL_X402_PAY_TO` to the (write-once) receiving address.
3. `GET /api/x402/status` shows the exact payment requirement; `GET /api/x402/route?...` returns `402` with a
   `PAYMENT-REQUIRED` header, verifies `PAYMENT-SIGNATURE` with B402, computes the route, settles, and returns
   `PAYMENT-RESPONSE`. Nothing is settled if the route fails.

### Optional integrator fee

Off by default. Setting `FAIRFILL_FEE_PERCENT` (for example `0.1`) and `FAIRFILL_FEE_RECIPIENT` enables the
Trading API custom fee: the percentage is sent atomically to the recipient in USDT, from the input on buys and
from the output on sells. Quotes already return the net amount, so the fee is part of the all-in cost FairFill
ranks by, and the UI, the paid route and the explanation all show it. RFQ routes ignore fee parameters, so they
never carry one; the per-route fee comes from the quote itself.

## Safety

- FairFill never holds keys. SWAP transactions are signed by the user's wallet; RFQ orders are EIP-712 signed by
  the user; Agentic Wallet trades obey the limits set in the Binance App.
- Every SWAP is simulated through the Transaction API before the wallet is asked to sign.
- Approvals are for the exact amount, never unlimited.
- The Web3 API secret stays on the server. Public routes are rate-limited (the API allows 5 RPS per endpoint).
- FairFill compares execution venues. It does not recommend what to buy. Not investment advice.
- The optional integrator fee is off unless both fee variables are set, and it is always shown to the user.

## Status and known limits

- Execution paths follow the official OpenAPI schema and integration guides and are covered by unit tests
  where they are pure logic; live execution still has to be verified with a funded wallet and API keys.
- xStocks is not covered by the RWA Data API platform filter, so its catalog entry comes from Binance's public
  tokenized-stock list.
- The managed Agent Studio runtime is testnet-only; mainnet requires self-hosting on AWS AgentCore.

## Repository

```
apps/web          Next.js 16 app (UI + API routes)
apps/mcp          MCP server (stdio)
packages/core     engine: Web3 API client, ranking, x402 gate, receipts, DX journal
skills/fairfill   Agent skill + zero-dependency CLI
agents/studio     BNB Agent Studio seller integration
prototype         the first live cross-issuer tape (public data)
```

## License

MIT

import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BoardSkeleton, TapeDashboard } from "@/components/home/board";
import { LiveSplit, LiveSplitSkeleton } from "@/components/home/live-split";
import { AgentsTeaser, Pipeline } from "@/components/home/sections";
import { CountUp } from "@/components/live";
import { IssuerChip, SectionHeading } from "@/components/primitives";
import { SearchBox } from "@/components/search-box";
import { TickerTape } from "@/components/ticker-tape";
import { loadBoard } from "@/lib/board";
import { getEngine } from "@/lib/server";

const QUICK = [
  { label: "Apple", ticker: "AAPL" },
  { label: "NVIDIA", ticker: "NVDA" },
  { label: "Tesla", ticker: "TSLA" },
  { label: "S&P 500", ticker: "SPY" },
  { label: "Coinbase", ticker: "COIN" },
];

async function boardPayload() {
  const [rows, session] = await Promise.all([loadBoard(), getEngine().marketSession()]);
  return { rows, session, fetchedAt: Date.now() };
}

async function Tape() {
  return <TickerTape initial={await boardPayload()} />;
}

async function HeroCard() {
  const engine = getEngine();
  const [snapshot, history] = await Promise.all([engine.tape("AAPL"), engine.history("AAPL", "1d").catch(() => null)]);
  return snapshot ? <LiveSplit initial={snapshot} initialHistory={history} /> : null;
}

async function TapeSection() {
  return <TapeDashboard initial={await boardPayload()} />;
}

async function CatalogStats() {
  const directory = await getEngine().directory();
  const stats = [
    { value: directory.length, label: "Tickers on BSC" },
    { value: directory.filter((l) => l.versions.length > 1).length, label: "With 2+ versions" },
    { value: directory.filter((l) => l.versions.length === 3).length, label: "In all three" },
  ];
  return (
    <dl className="mt-10 grid max-w-lg grid-cols-3 divide-x divide-line rounded-xl border border-line bg-ink-850">
      {stats.map((s) => (
        <div key={s.label} className="px-4 py-3.5">
          <dt className="text-xs text-fg-muted">{s.label}</dt>
          <dd className="figure mt-1 text-3xl">
            <CountUp value={s.value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default async function Home() {
  await connection();
  const engine = getEngine();
  return (
    <>
      <Suspense fallback={<div className="h-[41px] border-b border-line bg-ink-900" />}>
        <Tape />
      </Suspense>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div className="min-w-0 animate-rise">
          <p className="eyebrow flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-gold" /> BNB Hack · Tokenized Stocks Edition
          </p>
          <h1 className="heading mt-5 text-[2.9rem] sm:text-[4.2rem]">
            One stock.
            <br />
            <span className="text-fg-muted">Three tokens.</span>
            <br />
            One <span className="text-gold">fair</span> fill.
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-fg-muted">
            Apple trades on BNB Chain as <span className="num text-fg-soft">AAPLB</span>, <span className="num text-fg-soft">AAPLon</span> and{" "}
            <span className="num text-fg-soft">AAPLx</span>, with different prices, hours and liquidity. FairFill quotes every version, drops the
            ones that cannot really fill, and executes the fair one. Your broker owes you best execution. Now your wallet does too.
          </p>
          <div className="mt-8 max-w-xl">
            <SearchBox />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-fg-muted">Try</span>
              {QUICK.map((q) => (
                <Link
                  key={q.ticker}
                  href={`/s/${q.ticker}`}
                  className="rounded-md border border-line bg-ink-850 px-3 py-1 text-xs text-fg-soft transition hover:border-gold/50 hover:text-fg"
                >
                  {q.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            <IssuerChip issuer="bstocks" />
            <IssuerChip issuer="ondo" />
            <IssuerChip issuer="xstocks" />
          </div>
          <Suspense fallback={<div className="mt-10 h-[84px] max-w-lg rounded-xl border border-line" />}>
            <CatalogStats />
          </Suspense>
        </div>
        <Suspense fallback={<LiveSplitSkeleton />}>
          <HeroCard />
        </Suspense>
      </section>

      <section id="tape" className="mx-auto max-w-7xl scroll-mt-24 px-4 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <SectionHeading eyebrow="The consolidated tape" title={<>Every version, <span className="text-gold">side by side</span>.</>}>
            Live per-share prices for the most traded names against a fair reference. Struck-through versions show prices nobody is trading.
          </SectionHeading>
          <p className="text-xs text-fg-muted">{engine.mode === "live" ? "Signed Binance Web3 API data" : "Preview data, indicative prices"}</p>
        </div>
        <Suspense fallback={<BoardSkeleton />}>
          <TapeSection />
        </Suspense>
      </section>

      <section id="how" className="mx-auto mt-28 max-w-7xl scroll-mt-24 px-4 sm:px-6">
        <div className="mb-10">
          <SectionHeading eyebrow="How a fair fill happens" title={<>Six checks between <span className="text-gold">“buy Apple”</span> and a filled order.</>}>
            Each step runs on a Binance Web3 API module. None of them asks you what an RFQ is.
          </SectionHeading>
        </div>
        <Pipeline />
      </section>

      <section className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
        <div className="mb-10">
          <SectionHeading eyebrow="Built for agents too" title={<>Humans click. Agents <span className="text-gold">pay a cent</span>.</>}>
            The same engine answers a skill, an MCP tool and a paid x402 endpoint, so trading agents stop guessing which Apple to buy.
          </SectionHeading>
        </div>
        <AgentsTeaser baseUrl={engine.config.baseUrl} />
      </section>
    </>
  );
}

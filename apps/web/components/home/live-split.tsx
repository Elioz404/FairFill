"use client";

import { ISSUERS, fmtBps, fmtCompactUsd, fmtUsd, rankVenues, type PriceHistory, type TapeSnapshot } from "@fairfill/core/shared";
import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { Sparkline } from "../charts";
import { AnimatedNumber, RefreshIndicator, usePoll } from "../live";
import { BpsBar, IssuerMark, Stamp, verdictOf } from "../primitives";

const TICKERS = ["AAPL", "NVDA", "TSLA", "COIN"];
const TAPE_MS = 15_000;

export function LiveSplit({ initial, initialHistory }: { initial: TapeSnapshot; initialHistory: PriceHistory | null }) {
  const [ticker, setTicker] = useState(initial.listing.ticker);
  const isInitial = ticker === initial.listing.ticker;
  const tape = usePoll<TapeSnapshot>(`/api/tape/${ticker}`, TAPE_MS, isInitial ? initial : null);
  const history = usePoll<PriceHistory>(`/api/history/${ticker}?range=1d`, 90_000, isInitial ? initialHistory : null);

  // While a newly selected ticker loads, keep showing the previous one dimmed.
  const snapshot = tape.data ?? initial;
  const loading = snapshot.listing.ticker !== ticker;
  const { ranked } = rankVenues(snapshot.venues);
  const bestKey = ranked[0]?.version.address;
  const rows = [...snapshot.venues].sort((a, b) => Number(b.version.address === bestKey) - Number(a.version.address === bestKey));
  const trend = (address: string) =>
    (history.data?.ticker === snapshot.listing.ticker ? history.data.series.find((s) => s.address === address)?.values : undefined)
      ?.filter((v, i): v is number => v !== null && i % 6 === 0) ?? [];

  return (
    <div className="panel relative overflow-hidden p-5 sm:p-6 animate-rise">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Live split · BNB Smart Chain</p>
        <RefreshIndicator updatedAt={tape.updatedAt} intervalMs={TAPE_MS} refreshing={tape.refreshing} />
      </div>

      <div role="tablist" aria-label="Ticker" className="mt-4 flex gap-1 rounded-lg bg-ink-850 p-1">
        {TICKERS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={t === ticker}
            onClick={() => setTicker(t)}
            className={clsx(
              "num flex-1 rounded-md py-1.5 text-xs font-medium transition",
              t === ticker ? "bg-ink-700 text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className={clsx("transition-opacity", loading && "opacity-50")}>
        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-lg font-semibold tracking-tight">{snapshot.listing.name ?? snapshot.listing.ticker}</p>
            <p className="text-xs text-fg-muted">
              {snapshot.benchmark.source === "us-market" ? "US market reference" : "On-chain consensus reference"}
            </p>
          </div>
          <AnimatedNumber value={snapshot.benchmark.priceUsd} format={fmtUsd} className="figure text-3xl" />
        </div>

        <ul className="mt-5 space-y-2">
          {rows.map((venue) => {
            const isBest = venue.version.address === bestKey;
            const verdict = verdictOf(venue);
            const dead = venue.excluded?.code === "NO_LIQUIDITY";
            return (
              <li
                key={venue.version.address}
                className={clsx(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 rounded-lg border px-3.5 py-3",
                  isBest ? "border-gold/50 bg-gold/[0.05]" : "border-line bg-ink-850",
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <IssuerMark issuer={venue.version.issuer} tone={isBest ? "accent" : dead ? "dim" : "default"} />
                  <span className={clsx("num text-sm font-semibold", dead && "text-fg-muted")}>{venue.version.symbol}</span>
                  <span className="truncate text-xs text-fg-muted">{ISSUERS[venue.version.issuer].label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <AnimatedNumber
                    value={venue.market.perSharePriceUsd}
                    format={fmtUsd}
                    className={clsx("num text-sm", dead ? "text-fg-muted line-through" : "text-fg")}
                  />
                  {isBest ? <Stamp tone="gold">Fair fill</Stamp> : <Stamp tone={verdict.tone}>{verdict.label}</Stamp>}
                </div>
                <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                  <div className="space-y-2">
                    <BpsBar bps={dead ? null : venue.costBps} emphasis={isBest} />
                    <div className="flex justify-between text-[11px] text-fg-muted">
                      <span className="num">{dead ? "not tradable" : fmtBps(venue.costBps)}</span>
                      <span className="num">{fmtCompactUsd(venue.market.onchainVolume24hUsd)} 24h</span>
                    </div>
                  </div>
                  <Sparkline values={trend(venue.version.address)} emphasis={isBest} width={96} height={30} label={`${venue.version.symbol} 24h`} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 text-xs text-fg-muted">
        <span>Premium per share vs reference · 24h trend</span>
        <Link href={`/s/${snapshot.listing.ticker}`} className="font-medium text-gold hover:text-gold-bright">
          Open {snapshot.listing.ticker}
        </Link>
      </div>
    </div>
  );
}

export function LiveSplitSkeleton() {
  return (
    <div className="panel p-6">
      <div className="h-4 w-40 animate-pulse rounded bg-ink-700" />
      <div className="mt-4 h-9 animate-pulse rounded bg-ink-750" />
      <div className="mt-5 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-lg border border-line bg-ink-850" />
        ))}
      </div>
    </div>
  );
}

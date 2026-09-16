"use client";

import { HISTORY_RANGES, fmtUsd, isWeekendLike, rankVenues, seriesSummary, type HistoryRange, type PriceHistory, type TapeSnapshot } from "@fairfill/core/shared";
import clsx from "clsx";
import { MoonStar } from "lucide-react";
import { useState } from "react";
import { PriceChart } from "../charts";
import { AnimatedNumber, RefreshIndicator, usePoll } from "../live";
import { VersionCard } from "./version-card";

const TAPE_MS = 15_000;

export function LiveReference({ initial }: { initial: TapeSnapshot }) {
  const { data } = usePoll<TapeSnapshot>(`/api/tape/${initial.listing.ticker}`, TAPE_MS, initial);
  const snap = data ?? initial;
  return (
    <div className="text-right">
      <p className="eyebrow">Fair reference</p>
      <AnimatedNumber value={snap.benchmark.priceUsd} format={fmtUsd} className="figure mt-1 block text-5xl" />
      <p className="mt-1 max-w-xs text-xs text-fg-muted">{snap.benchmark.note}</p>
    </div>
  );
}

export function StockLive({ initial, initialHistory }: { initial: TapeSnapshot; initialHistory: PriceHistory | null }) {
  const ticker = initial.listing.ticker;
  const tape = usePoll<TapeSnapshot>(`/api/tape/${ticker}`, TAPE_MS, initial);
  const [range, setRange] = useState<HistoryRange>("1d");
  const history = usePoll<PriceHistory>(`/api/history/${ticker}?range=${range}`, 90_000, range === "1d" ? initialHistory : null);
  const dayHistory = usePoll<PriceHistory>(`/api/history/${ticker}?range=1d`, 90_000, initialHistory);

  const snap = tape.data ?? initial;
  const { ranked } = rankVenues(snap.venues);
  const bestKey = ranked[0]?.version.address ?? null;
  const chartData = history.data && history.data.range === range ? history.data : null;
  const seriesFor = (address: string) => dayHistory.data?.series.find((s) => s.address === address);

  return (
    <div className="space-y-10">
      {isWeekendLike(snap.session) ? (
        <div className="flex gap-3 rounded-xl border border-gold/40 bg-ink-800 p-4 text-sm text-fg-soft">
          <MoonStar className="mt-0.5 size-4 shrink-0 text-gold" />
          <p className="leading-relaxed">
            <span className="font-semibold text-fg">Weekend mode.</span> The US market is closed, so RFQ venues stop quoting and the reference is
            frozen. On-chain prices keep moving; anything paid above the reference now is a weekend premium, not a better deal.
          </p>
        </div>
      ) : null}

      <section aria-labelledby="versions-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="versions-title" className="text-lg font-semibold tracking-tight">
            Versions on BNB Smart Chain
          </h2>
          <RefreshIndicator updatedAt={tape.updatedAt} intervalMs={TAPE_MS} refreshing={tape.refreshing} />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {snap.venues.map((venue) => {
            const series = seriesFor(venue.version.address);
            const values = series?.values ?? [];
            return (
              <VersionCard
                key={venue.version.address}
                venue={venue}
                isBest={venue.version.address === bestKey}
                trend={values.filter((v, i): v is number => v !== null && i % 4 === 0)}
                trendChangePct={seriesSummary(values).changePct}
                lastTradeAt={series?.lastTradeAt ?? null}
              />
            );
          })}
        </div>
      </section>

      <section aria-labelledby="chart-title" className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="chart-title" className="text-lg font-semibold tracking-tight">
              Per-share price by version
            </h2>
            <p className="mt-1 text-xs text-fg-muted">
              Last traded price carried forward. A flat line means nobody traded that version.{" "}
              {chartData ? `Source: ${chartData.source === "web3-api" ? "Binance Web3 Market API candles" : "Binance public K-line feed"}.` : null}
            </p>
          </div>
          <div role="radiogroup" aria-label="Time range" className="flex gap-1 rounded-lg bg-ink-850 p-1">
            {(Object.keys(HISTORY_RANGES) as HistoryRange[]).map((r) => (
              <button
                key={r}
                role="radio"
                aria-checked={range === r}
                onClick={() => setRange(r)}
                className={clsx("num rounded-md px-3 py-1.5 text-xs font-medium transition", range === r ? "bg-ink-700 text-fg" : "text-fg-muted hover:text-fg")}
              >
                {HISTORY_RANGES[r].label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5">
          {chartData || history.data ? (
            <PriceChart history={(chartData ?? history.data) as PriceHistory} emphasisAddress={bestKey} dimmed={!chartData || history.refreshing} />
          ) : history.error ? (
            <p className="py-16 text-center text-sm text-fg-muted">Price history unavailable: {history.error}</p>
          ) : (
            <div className="h-[296px] animate-pulse rounded-lg bg-ink-850" />
          )}
        </div>
      </section>
    </div>
  );
}

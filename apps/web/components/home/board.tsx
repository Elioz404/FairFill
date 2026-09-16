"use client";

import { ISSUERS, ISSUER_ORDER, fmtBps, fmtCompactUsd, fmtUsd, rankVenues, type SessionInfo } from "@fairfill/core/shared";
import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import type { BoardRow } from "@/lib/board";
import { Sparkline } from "../charts";
import { AnimatedNumber, Delta, RefreshIndicator, usePoll } from "../live";
import { IssuerMark } from "../primitives";
import { SessionClock } from "../session";
import { StockLogo } from "../stock-logo";

const BOARD_MS = 20_000;

interface BoardPayload {
  rows: BoardRow[];
  session: SessionInfo;
  fetchedAt: number;
}

type SortKey = "gap" | "trend" | "name";

function derive(row: BoardRow) {
  const { ranked, excluded } = rankVenues(row.snapshot.venues);
  const costs = ranked.map((r) => r.costBps).filter((c): c is number => c !== null);
  return {
    row,
    best: ranked[0] ?? null,
    gap: costs.length > 1 ? Math.max(...costs) - Math.min(...costs) : null,
    stale: excluded.filter((e) => e.excluded?.code === "NO_LIQUIDITY"),
  };
}

export function TapeDashboard({ initial }: { initial: BoardPayload }) {
  const poll = usePoll<BoardPayload>("/api/board", BOARD_MS, initial);
  const data = poll.data ?? initial;
  const [sort, setSort] = useState<SortKey>("gap");

  const items = useMemo(() => {
    const list = data.rows.map(derive);
    return list.sort((a, b) => {
      if (sort === "name") return a.row.snapshot.listing.ticker.localeCompare(b.row.snapshot.listing.ticker);
      if (sort === "trend") return Math.abs(b.row.trendChangePct ?? 0) - Math.abs(a.row.trendChangePct ?? 0);
      return (b.gap ?? -1) - (a.gap ?? -1);
    });
  }, [data.rows, sort]);

  return (
    <div className="space-y-16">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="Sort" className="flex gap-1 rounded-lg bg-ink-850 p-1">
            {(
              [
                ["gap", "Version gap"],
                ["trend", "24h move"],
                ["name", "Ticker"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="radio"
                aria-checked={sort === key}
                onClick={() => setSort(key)}
                className={clsx("rounded-md px-3 py-1.5 text-xs font-medium transition", sort === key ? "bg-ink-700 text-fg" : "text-fg-muted hover:text-fg")}
              >
                {label}
              </button>
            ))}
          </div>
          <RefreshIndicator updatedAt={poll.updatedAt} intervalMs={BOARD_MS} refreshing={poll.refreshing} />
        </div>

        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.1em] text-fg-muted">
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">Versions on BSC</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Fair venue now</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">24h, fair venue</th>
                  <th className="px-4 py-3 text-right font-medium">Reference</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Version gap</th>
                  <th className="hidden px-3 py-3 lg:table-cell" />
                </tr>
              </thead>
              <tbody>
                {items.map(({ row, best, gap }) => {
                  const snap = row.snapshot;
                  return (
                    <tr key={snap.listing.ticker} className="group border-b border-line/70 transition-colors last:border-0 hover:bg-ink-750/60">
                      <td className="px-4 py-3.5">
                        <Link href={`/s/${snap.listing.ticker}`} className="flex items-center gap-3">
                          <StockLogo ticker={snap.listing.ticker} logoUrl={snap.listing.logoUrl} size="sm" />
                          <span>
                            <span className="block font-medium text-fg">{snap.listing.name ?? snap.listing.ticker}</span>
                            <span className="num text-xs text-fg-muted">{snap.listing.ticker}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="hidden px-4 py-3.5 lg:table-cell">
                        <div className="flex flex-wrap gap-1.5">
                          {snap.venues.map((v) => {
                            const bad = v.excluded !== null;
                            const isBest = v.version.address === best?.version.address;
                            return (
                              <span
                                key={v.version.address}
                                title={v.excluded?.reason ?? `${ISSUERS[v.version.issuer].label}: tradable`}
                                className={clsx(
                                  "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px]",
                                  isBest ? "border-gold/50 text-fg" : bad ? "border-line text-fg-muted" : "border-line-strong text-fg-soft",
                                )}
                              >
                                <IssuerMark issuer={v.version.issuer} tone={isBest ? "accent" : bad ? "dim" : "default"} size={8} />
                                <span className={clsx("num", bad && "line-through")}>{v.version.symbol}</span>
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        {best ? (
                          <span className="flex items-center gap-2">
                            <IssuerMark issuer={best.version.issuer} tone="accent" />
                            <span className="text-fg">{ISSUERS[best.version.issuer].label}</span>
                            <span className="num text-xs text-fg-muted">{fmtBps(best.costBps)}</span>
                          </span>
                        ) : (
                          <span className="text-fg-muted">No fill now</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <span className="flex items-center gap-3">
                          <Sparkline values={row.trend} emphasis width={88} height={26} label={`${snap.listing.ticker} fair venue, 24 hours`} />
                          <Delta pct={row.trendChangePct} className="num text-xs" />
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right">
                        <AnimatedNumber value={snap.benchmark.priceUsd} format={fmtUsd} className="num text-fg" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right">
                        <AnimatedNumber value={gap} format={(v) => (v === null ? "—" : `${Math.round(v)} bps`)} className="num text-fg-soft" />
                      </td>
                      <td className="hidden px-3 py-3.5 text-right lg:table-cell">
                        <Link
                          href={`/s/${snap.listing.ticker}`}
                          aria-label={`Open ${snap.listing.ticker}`}
                          className="inline-grid size-8 place-items-center rounded-md border border-line text-fg-muted transition group-hover:border-gold/50 group-hover:text-gold"
                        >
                          <ArrowUpRight className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="pulse" className="scroll-mt-24">
        <div className="mb-8 max-w-2xl">
          <p className="eyebrow">Market pulse</p>
          <h2 className="heading mt-3 text-3xl text-fg sm:text-[2.6rem]">
            What the tape is saying <span className="text-gold">right now</span>.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">Recomputed from the same live data every 20 seconds.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <GapChart items={items} />
          <StaleMatrix items={items} />
          <article className="panel min-w-0 p-6">
            <p className="eyebrow">US session</p>
            <p className="mt-1 text-sm text-fg-muted">RFQ venues only quote while it is open.</p>
            <div className="mt-6">
              <SessionClock initial={data.session} />
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

type Item = ReturnType<typeof derive>;

/** Horizontal bars: gap between the cheapest and dearest tradable version, widest emphasized. */
function GapChart({ items }: { items: Item[] }) {
  const bars = items.filter((i) => i.gap !== null).sort((a, b) => (b.gap as number) - (a.gap as number)).slice(0, 8);
  const max = Math.max(1, ...bars.map((b) => b.gap as number));
  const widest = bars[0];
  return (
    <article className="panel min-w-0 p-6">
      <p className="eyebrow">Same share, different price</p>
      <p className="mt-1 text-sm text-fg-muted">Gap between tradable versions, basis points.</p>
      <p className="figure mt-5 text-5xl">
        {widest ? <AnimatedNumber value={widest.gap} format={(v) => (v === null ? "—" : String(Math.round(v)))} /> : "—"}
        <span className="ml-2 text-base font-medium text-fg-muted">bps on {widest?.row.snapshot.listing.ticker ?? "—"}</span>
      </p>
      <ul className="mt-6 space-y-2.5">
        {bars.map((b, index) => (
          <li key={b.row.snapshot.listing.ticker} className="group grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-xs" title={`${b.row.snapshot.listing.ticker}: ${Math.round(b.gap as number)} bps`}>
            <span className="flex items-center gap-2">
              <StockLogo ticker={b.row.snapshot.listing.ticker} logoUrl={b.row.snapshot.listing.logoUrl} size="xs" />
              <span className="num text-fg-soft">{b.row.snapshot.listing.ticker}</span>
            </span>
            <span className="h-3 rounded-r-[4px] bg-ink-750">
              <span
                className={clsx("block h-3 rounded-r-[4px] transition-all duration-700", index === 0 ? "bg-gold" : "bg-series-dim group-hover:bg-series-context")}
                style={{ width: `${Math.max(2, ((b.gap as number) / max) * 100)}%` }}
              />
            </span>
            <span className="num text-right text-fg-muted">{Math.round(b.gap as number)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Tickers × issuers: which versions can really fill right now. */
function StaleMatrix({ items }: { items: Item[] }) {
  const staleCount = items.reduce((n, i) => n + i.stale.length, 0);
  const worst = items
    .flatMap((i) => i.stale.map((s) => ({ s, ref: i.row.snapshot.benchmark.priceUsd })))
    .map(({ s, ref }) => ({ s, bps: ref && s.market.perSharePriceUsd ? (s.market.perSharePriceUsd / ref - 1) * 10_000 : null }))
    .sort((a, b) => Math.abs(b.bps ?? 0) - Math.abs(a.bps ?? 0))[0];
  return (
    <article className="panel min-w-0 p-6">
      <p className="eyebrow">Dead pools look like discounts</p>
      <p className="mt-1 text-sm text-fg-muted">Displayed prices nobody is trading.</p>
      <p className="figure mt-5 text-5xl">
        <AnimatedNumber value={staleCount} format={(v) => String(Math.round(v ?? 0))} />
        <span className="ml-2 text-base font-medium text-fg-muted">stale prices</span>
      </p>
      {worst ? (
        <p className="mt-2 text-xs leading-relaxed text-fg-muted">
          e.g. <span className="num text-fg-soft">{worst.s.version.symbol}</span> shows {fmtBps(worst.bps)} vs the reference with{" "}
          {fmtCompactUsd(worst.s.market.onchainVolume24hUsd)} traded in 24h.
        </p>
      ) : null}
      {/* Fluid grid: columns shrink with the card, so it never scrolls sideways. */}
      <div
        role="table"
        aria-label="Tradability of each version"
        className="mt-5 grid items-center gap-x-1 gap-y-1.5"
        style={{ gridTemplateColumns: `4.25rem repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {/* The corner cell must stay in the grid flow, so only its text is visually hidden. */}
        <span role="columnheader">
          <span className="sr-only">Issuer</span>
        </span>
        {items.map((i) => (
          <span key={i.row.snapshot.listing.ticker} role="columnheader" className="flex justify-center" title={i.row.snapshot.listing.name ?? i.row.snapshot.listing.ticker}>
            <StockLogo ticker={i.row.snapshot.listing.ticker} logoUrl={i.row.snapshot.listing.logoUrl} size="xs" className="size-auto! aspect-square w-full max-w-6" />
            <span className="sr-only">{i.row.snapshot.listing.ticker}</span>
          </span>
        ))}
        {ISSUER_ORDER.map((issuer) => (
          <Fragment key={issuer}>
            <span role="rowheader" className="flex min-w-0 items-center gap-1.5 text-[11px] text-fg-muted">
              <IssuerMark issuer={issuer} size={8} />
              <span className="truncate">{ISSUERS[issuer].label}</span>
            </span>
            {items.map((i) => {
              const v = i.row.snapshot.venues.find((x) => x.version.issuer === issuer);
              const state = !v ? "none" : v.version.address === i.best?.version.address ? "fair" : v.excluded?.code === "NO_LIQUIDITY" ? "stale" : v.excluded ? "closed" : "ok";
              const label = { none: "not listed", fair: "fair venue", stale: "stale price", closed: "closed", ok: "tradable" }[state];
              return (
                <span key={i.row.snapshot.listing.ticker} role="cell" className="flex justify-center">
                  <span
                    title={`${i.row.snapshot.listing.ticker} · ${ISSUERS[issuer].label}: ${label}`}
                    aria-label={`${i.row.snapshot.listing.ticker} ${ISSUERS[issuer].label}: ${label}`}
                    className={clsx(
                      "block aspect-square w-full max-w-6 rounded-[4px] transition-colors duration-500",
                      state === "fair" && "bg-gold",
                      state === "ok" && "bg-series-dim",
                      state === "stale" && "border border-dashed border-fg-muted",
                      state === "closed" && "border border-line-strong",
                      state === "none" && "bg-ink-850",
                    )}
                  />
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-fg-muted" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-gold" /> Fair venue</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-series-dim" /> Tradable</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] border border-dashed border-fg-muted" /> Stale price</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] border border-line-strong" /> Closed</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-ink-850" /> Not listed</li>
      </ul>
    </article>
  );
}

export function BoardSkeleton() {
  return (
    <div className="panel p-5">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="mb-3 h-12 animate-pulse rounded-md bg-ink-750 last:mb-0" />
      ))}
    </div>
  );
}

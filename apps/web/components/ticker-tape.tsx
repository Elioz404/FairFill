"use client";

import { ISSUERS, fmtUsd, rankVenues, type SessionInfo } from "@fairfill/core/shared";
import Link from "next/link";
import type { BoardRow } from "@/lib/board";
import { Delta, usePoll } from "./live";
import { IssuerMark } from "./primitives";
import { StockLogo } from "./stock-logo";

/** Scrolling strip: reference price, 24h move and fair venue per ticker. Refreshes with the board. */
export function TickerTape({ initial }: { initial: { rows: BoardRow[]; session: SessionInfo; fetchedAt: number } }) {
  const { data } = usePoll("/api/board", 30_000, initial);
  const rows = (data ?? initial).rows;
  if (rows.length === 0) return null;
  const items = rows.map((row) => ({ row, best: rankVenues(row.snapshot.venues).ranked[0] }));
  const strip = (key: string) => (
    <ul className="flex shrink-0 items-center gap-9 pr-9" aria-hidden={key === "b"}>
      {items.map(({ row, best }) => (
        <li key={`${key}-${row.snapshot.listing.ticker}`} className="flex items-center gap-2.5 whitespace-nowrap text-xs">
          <StockLogo ticker={row.snapshot.listing.ticker} logoUrl={row.snapshot.listing.logoUrl} size="xs" />
          <Link href={`/s/${row.snapshot.listing.ticker}`} tabIndex={key === "b" ? -1 : 0} className="num font-semibold text-fg hover:text-gold">
            {row.snapshot.listing.ticker}
          </Link>
          <span className="num text-fg-soft">{fmtUsd(row.snapshot.benchmark.priceUsd)}</span>
          <Delta pct={row.trendChangePct} className="num" />
          {best ? (
            <span className="flex items-center gap-1.5 text-fg-muted">
              <IssuerMark issuer={best.version.issuer} tone="accent" size={8} />
              {ISSUERS[best.version.issuer].label}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="border-b border-line bg-ink-900">
      <div className="tape-mask group flex max-w-[100vw] overflow-hidden py-2.5">
        <div className="flex animate-tape group-hover:[animation-play-state:paused]">
          {strip("a")}
          {strip("b")}
        </div>
      </div>
    </div>
  );
}

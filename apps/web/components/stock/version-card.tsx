"use client";

import { BSCTRACE_TOKEN, ISSUERS, fmtBps, fmtCompactUsd, fmtUsd, shortAddress, type VenueAssessment } from "@fairfill/core/shared";
import clsx from "clsx";
import { ExternalLink } from "lucide-react";
import { Sparkline } from "../charts";
import { AnimatedNumber, Delta } from "../live";
import { BpsBar, IssuerMark, LiquidityMeter, Stamp, verdictOf } from "../primitives";

export function VersionCard({
  venue,
  isBest,
  trend,
  trendChangePct,
  lastTradeAt,
}: {
  venue: VenueAssessment;
  isBest: boolean;
  trend: number[];
  trendChangePct: number | null;
  lastTradeAt: number | null;
}) {
  const info = ISSUERS[venue.version.issuer];
  const verdict = verdictOf(venue);
  const dead = venue.excluded?.code === "NO_LIQUIDITY";
  const sinceTrade = lastTradeAt ? Date.now() - lastTradeAt : null;
  return (
    <article
      className={clsx(
        "relative flex min-w-0 flex-col rounded-xl border p-5 transition-colors",
        isBest ? "border-gold/60 bg-ink-800" : "border-line bg-ink-850",
      )}
    >
      {isBest ? <span className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-gold" aria-hidden /> : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <IssuerMark issuer={venue.version.issuer} tone={isBest ? "accent" : dead ? "dim" : "default"} /> {info.label}
          </p>
          <p className="num mt-1.5 text-xl font-semibold">{venue.version.symbol}</p>
        </div>
        {isBest ? <Stamp tone="gold">Fair fill</Stamp> : <Stamp tone={verdict.tone}>{verdict.label}</Stamp>}
      </div>

      <div className="mt-5">
        <p className="text-[11px] text-fg-muted">Per share</p>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <AnimatedNumber
            value={venue.market.perSharePriceUsd}
            format={fmtUsd}
            className={clsx("figure text-3xl", dead && "text-fg-muted line-through decoration-fg-faint")}
          />
          <Delta pct={trendChangePct} className="num text-xs" />
        </div>
        <div className="mt-3">
          <Sparkline values={trend} emphasis={isBest} width={240} height={40} fluid label={`${venue.version.symbol} per-share price, 24 hours`} />
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <BpsBar bps={dead ? null : venue.costBps} emphasis={isBest} />
          <span className="num text-xs text-fg-soft">{dead ? "not tradable" : fmtBps(venue.costBps)}</span>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div>
          <dt className="text-fg-muted">24h on-chain</dt>
          <dd className="mt-1 flex items-center gap-2">
            <LiquidityMeter usd={venue.market.onchainVolume24hUsd} />
            <span className="num text-fg">{fmtCompactUsd(venue.market.onchainVolume24hUsd)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted">Execution</dt>
          <dd className="mt-1 text-fg">{info.executionLabel}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Shares per token</dt>
          <dd className="num mt-1 text-fg">{venue.version.shareRatio.toFixed(4)}</dd>
        </div>
        <div>
          <dt className="text-fg-muted">Last trade</dt>
          <dd className="num mt-1 text-fg" suppressHydrationWarning>
            {sinceTrade === null
              ? "—"
              : sinceTrade < 10 * 60_000
                ? "just now"
                : sinceTrade < 3_600_000
                  ? `${Math.round(sinceTrade / 60_000)}m ago`
                  : sinceTrade < 48 * 3_600_000
                    ? `${Math.round(sinceTrade / 3_600_000)}h ago`
                    : `${Math.round(sinceTrade / 86_400_000)}d ago`}
          </dd>
        </div>
      </dl>

      {venue.excluded ? (
        <p className="mt-5 rounded-lg border border-line bg-ink-900 p-3 text-xs leading-relaxed text-fg-soft">{venue.excluded.reason}</p>
      ) : (
        <p className="mt-5 text-xs leading-relaxed text-fg-muted">{info.hours}.</p>
      )}

      <a
        href={BSCTRACE_TOKEN(venue.version.address)}
        target="_blank"
        rel="noreferrer"
        className="num mt-auto inline-flex items-center gap-1.5 pt-5 text-[11px] text-fg-muted hover:text-gold"
      >
        {shortAddress(venue.version.address)} <ExternalLink className="size-3" />
      </a>
    </article>
  );
}

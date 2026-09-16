import { ISSUERS, type DataMode, type IssuerId, type VenueAssessment } from "@fairfill/core/shared";
import clsx from "clsx";
import type { ReactNode } from "react";

/** Issuer identity by shape: bStocks solid, Ondo ring, xStocks dotted ring. */
export function IssuerMark({ issuer, tone = "default", size = 10 }: { issuer: IssuerId; tone?: "default" | "accent" | "dim"; size?: number }) {
  const color = tone === "accent" ? "var(--color-gold)" : tone === "dim" ? "var(--color-fg-faint)" : "var(--color-fg-soft)";
  const mark = ISSUERS[issuer].mark;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden className="shrink-0">
      {mark === "solid" ? (
        <circle cx="5" cy="5" r="4" fill={color} />
      ) : mark === "ring" ? (
        <circle cx="5" cy="5" r="3.6" fill="none" stroke={color} strokeWidth="1.6" />
      ) : (
        <circle cx="5" cy="5" r="3.6" fill="none" stroke={color} strokeWidth="1.6" strokeDasharray="1.2 1.6" />
      )}
    </svg>
  );
}

export function IssuerChip({ issuer, muted = false }: { issuer: IssuerId; muted?: boolean }) {
  const info = ISSUERS[issuer];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        muted ? "border-line text-fg-muted" : "border-line-strong text-fg-soft",
      )}
    >
      <IssuerMark issuer={issuer} tone={muted ? "dim" : "default"} />
      {info.label}
      <span className="num text-fg-muted">…{info.suffix}</span>
    </span>
  );
}

export type StampTone = "gold" | "neutral" | "muted";

export function Stamp({ tone, children }: { tone: StampTone; children: ReactNode }) {
  const color = { gold: "text-gold", neutral: "text-fg-soft", muted: "text-fg-muted" }[tone];
  return <span className={clsx("stamp", color)}>{children}</span>;
}

export function ModeBadge({ mode }: { mode: DataMode }) {
  return mode === "live" ? (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-gold/40 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-gold">
      <span className="size-1.5 rounded-full bg-gold animate-pulse-dot" /> LIVE
    </span>
  ) : (
    <span
      title="No Binance Web3 API keys configured: keyless public data, indicative prices, no execution."
      className="inline-flex items-center rounded-md border border-line-strong px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-fg-muted"
    >
      PREVIEW
    </span>
  );
}

/** Diverging bar around the fair reference. Left of center = below reference, right = above. */
export function BpsBar({ bps, emphasis = false }: { bps: number | null; emphasis?: boolean }) {
  if (bps === null) return <div className="h-1 rounded-full bg-ink-700" />;
  const clamped = Math.max(-100, Math.min(100, bps));
  const width = Math.max(3, Math.abs(clamped) / 2);
  const above = bps > 0;
  return (
    <div className="relative h-1 rounded-full bg-ink-700" aria-label={`${Math.round(bps)} basis points ${above ? "above" : "below"} the reference`}>
      <span className="absolute inset-y-[-3px] left-1/2 w-px bg-fg-faint" />
      <span
        className={clsx("absolute inset-y-0 rounded-full transition-all duration-700", emphasis ? "bg-gold" : "bg-series-dim")}
        style={above ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
      />
    </div>
  );
}

/** Five segments on a log scale: $1k · $10k · $100k · $1M · $10M of 24h on-chain turnover. */
export function LiquidityMeter({ usd }: { usd: number | null }) {
  const level = usd === null ? -1 : usd <= 0 ? 0 : Math.max(0, Math.min(5, Math.floor(Math.log10(usd)) - 2));
  return (
    <div className="flex items-end gap-0.5" aria-label={usd === null ? "turnover unknown" : `turnover level ${level} of 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={clsx("w-1.5 rounded-[1px]", i < level ? "bg-fg-soft" : "bg-ink-700")} style={{ height: `${5 + i * 3}px` }} />
      ))}
    </div>
  );
}

export function verdictOf(venue: VenueAssessment): { label: string; tone: StampTone } {
  if (!venue.excluded) return { label: venue.flags.includes("thin-liquidity") ? "Thin" : "Tradable", tone: "neutral" };
  switch (venue.excluded.code) {
    case "NO_LIQUIDITY":
      return { label: "Stale price", tone: "muted" };
    case "HALTED":
      return { label: "Closed", tone: "muted" };
    case "BELOW_MINIMUM":
      return { label: "Below min.", tone: "muted" };
    case "NEEDS_WALLET":
      return { label: "Needs wallet", tone: "muted" };
    case "PRICE_IMPACT":
      return { label: "Too shallow", tone: "muted" };
    default:
      return { label: "Unavailable", tone: "muted" };
  }
}

export function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="heading mt-3 text-3xl text-fg sm:text-[2.6rem]">{title}</h2>
      {children ? <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">{children}</p> : null}
    </div>
  );
}

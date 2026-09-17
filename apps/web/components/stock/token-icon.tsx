import type { IssuerId } from "@fairfill/core/shared";
import clsx from "clsx";
import { USDT_ICON } from "@/lib/brand-icons";
import { IssuerMark } from "../primitives";
import { StockLogo } from "../stock-logo";

/** A version token: the company mark with its issuer's shape as a corner badge. */
export function VersionIcon({ ticker, logoUrl, issuer, accent = false }: { ticker: string; logoUrl?: string | null; issuer: IssuerId; accent?: boolean }) {
  return (
    <span className="relative shrink-0">
      <StockLogo ticker={ticker} logoUrl={logoUrl} size="sm" />
      <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full border border-ink-900 bg-ink-850">
        <IssuerMark issuer={issuer} tone={accent ? "accent" : "default"} size={8} />
      </span>
    </span>
  );
}

export function UsdtIcon({ className }: { className?: string }) {
  return (
    <span className={clsx("grid size-8 shrink-0 place-items-center rounded-full border border-line-strong bg-ink-750", className)} title="USDT">
      <svg viewBox="0 0 24 24" role="img" aria-label="USDT" className="size-4 fill-fg-soft">
        <path d={USDT_ICON.path} />
      </svg>
    </span>
  );
}

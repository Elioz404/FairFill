import { ISSUERS, fmtBps, fmtShares, fmtUsd, type RouteDecision } from "@fairfill/core/shared";
import { AlertTriangle, Info } from "lucide-react";
import { IssuerMark, Stamp } from "../primitives";

export function RouteResult({ decision }: { decision: RouteDecision }) {
  const best = decision.best;
  const side = decision.order.side;
  const quote = best?.quote && best.quote.ok ? best.quote.best : null;
  return (
    <div className="space-y-4 animate-rise">
      {decision.warnings.length ? (
        <ul className="space-y-2">
          {decision.warnings.map((w) => (
            <li key={w} className="flex gap-2 rounded-lg border border-line bg-ink-800 p-3 text-xs leading-relaxed text-fg-soft">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-gold" /> {w}
            </li>
          ))}
        </ul>
      ) : null}

      {best ? (
        <div className="rounded-xl border border-gold/50 bg-ink-800 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Fair fill</p>
              <p className="mt-1.5 flex items-center gap-2 text-lg font-semibold">
                <IssuerMark issuer={best.version.issuer} tone="accent" />
                <span className="num">{best.version.symbol}</span>
                <span className="text-sm font-normal text-fg-muted">{ISSUERS[best.version.issuer].label}</span>
              </p>
            </div>
            <Stamp tone={best.indicative ? "muted" : "gold"}>{best.indicative ? "Indicative" : quote?.mode === "RFQ" ? "RFQ quote" : "Swap quote"}</Stamp>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-ink-900/70 p-2.5">
              <dt className="text-fg-muted">{side === "buy" ? "You get" : "You sell"}</dt>
              <dd className="num mt-1 text-base text-fg">{fmtShares(best.shares)} sh</dd>
            </div>
            <div className="rounded-lg bg-ink-900/70 p-2.5">
              <dt className="text-fg-muted">{side === "buy" ? "All-in per share" : "Net per share"}</dt>
              <dd className="num mt-1 text-base text-fg">{fmtUsd(best.effectivePerShareUsd)}</dd>
            </div>
            <div className="rounded-lg bg-ink-900/70 p-2.5">
              <dt className="text-fg-muted">vs fair reference</dt>
              <dd className={`num mt-1 text-base ${best.costBps !== null && best.costBps > 25 ? "text-gold" : "text-fg"}`}>{fmtBps(best.costBps)}</dd>
            </div>
            <div className="rounded-lg bg-ink-900/70 p-2.5">
              <dt className="text-fg-muted">{quote ? "Route · network fee" : "Reference"}</dt>
              <dd className="num mt-1 truncate text-base text-fg">
                {quote ? `${quote.vendor} · ${fmtUsd(quote.networkFeeUsd)}` : fmtUsd(decision.benchmark.priceUsd)}
              </dd>
            </div>
          </dl>
          {decision.spreadBps !== null ? (
            <p className="mt-3 text-xs text-fg-muted">
              The next-best version would have cost <span className="num text-gold">{fmtBps(decision.spreadBps).replace("+", "")}</span> more at the extreme.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-ink-800 p-4 text-sm text-fg-soft">No version of this stock can be filled right now.</div>
      )}

      <div>
        <p className="eyebrow mb-2">Why</p>
        <ul className="space-y-1.5">
          {decision.explanation.map((line) => (
            <li key={line} className="flex gap-2 text-xs leading-relaxed text-fg-muted">
              <Info className="mt-0.5 size-3 shrink-0 text-fg-muted" /> {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import { ISSUERS, fmtBps, fmtShares, fmtUsd, type RouteDecision } from "@fairfill/core/shared";
import clsx from "clsx";
import { AlertTriangle, ChevronRight, Info } from "lucide-react";
import { IssuerMark, Stamp, verdictOf } from "../primitives";

export function RouteResult({ decision }: { decision: RouteDecision }) {
  const best = decision.best;
  const side = decision.order.side;
  const quote = best?.quote && best.quote.ok ? best.quote.best : null;
  const versions = [...decision.ranked, ...decision.excluded];
  return (
    <div className="space-y-3 animate-rise">
      {best ? (
        <div className="rounded-xl border border-gold/50 bg-ink-800 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow">Fair fill</p>
              <p className="mt-1.5 flex items-center gap-2 text-lg font-semibold">
                <IssuerMark issuer={best.version.issuer} tone="accent" />
                <span className="num">{best.version.symbol}</span>
                <span className="truncate text-sm font-normal text-fg-muted">{ISSUERS[best.version.issuer].label}</span>
              </p>
            </div>
            <Stamp tone={best.indicative ? "muted" : "gold"}>{best.indicative ? "Indicative" : quote?.mode === "RFQ" ? "RFQ quote" : "Swap quote"}</Stamp>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 text-xs">
            <div>
              <dt className="text-fg-muted">{side === "buy" ? "You get" : "You sell"}</dt>
              <dd className="num mt-0.5 text-base text-fg">{fmtShares(best.shares)} sh</dd>
            </div>
            <div>
              <dt className="text-fg-muted">{side === "buy" ? "All-in per share" : "Net per share"}</dt>
              <dd className="num mt-0.5 text-base text-fg">{fmtUsd(best.effectivePerShareUsd)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">vs fair reference</dt>
              <dd className={clsx("num mt-0.5 text-base", best.costBps !== null && best.costBps > 25 ? "text-gold" : "text-fg")}>{fmtBps(best.costBps)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-fg-muted">{quote ? "Route · network fee" : "Reference"}</dt>
              <dd className="num mt-0.5 truncate text-base text-fg">
                {quote ? `${quote.vendor} · ${fmtUsd(quote.networkFeeUsd)}` : fmtUsd(decision.benchmark.priceUsd)}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-ink-800 p-4 text-sm text-fg-soft">No version of this stock can be filled right now.</div>
      )}

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow">Every version</p>
          {decision.spreadBps !== null ? (
            <p className="text-[11px] text-fg-muted" title="How much worse the worst tradable version is than the fair fill">
              version gap <span className="num text-gold">{fmtBps(decision.spreadBps).replace("+", "")}</span>
            </p>
          ) : null}
        </div>
        <ul className="mt-2 divide-y divide-line/70 rounded-xl border border-line">
          {versions.map((v) => {
            const isBest = v.version.address === best?.version.address;
            return (
              <li key={v.version.address} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                <IssuerMark issuer={v.version.issuer} tone={isBest ? "accent" : v.excluded ? "dim" : "default"} />
                <span className={clsx("num", isBest ? "text-fg" : v.excluded ? "text-fg-muted" : "text-fg-soft")}>{v.version.symbol}</span>
                <span className="truncate text-fg-muted">{ISSUERS[v.version.issuer].label}</span>
                <span className="ml-auto shrink-0">
                  {v.excluded ? (
                    <span className="text-fg-muted" title={v.excluded.reason}>
                      {verdictOf(v).label}
                    </span>
                  ) : (
                    <span className={clsx("num", isBest ? "text-gold" : "text-fg-soft")}>{fmtBps(v.costBps)}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {decision.warnings.length ? (
        <ul className="space-y-1.5">
          {decision.warnings.map((w) => (
            <li key={w} className="flex gap-2 text-[11px] leading-relaxed text-fg-muted">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-gold" /> {w}
            </li>
          ))}
        </ul>
      ) : null}

      <details className="group rounded-xl border border-line px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-fg-soft hover:text-fg [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          Why this version
          <span className="num ml-auto text-fg-muted">{decision.explanation.length}</span>
        </summary>
        <ul className="mt-2 space-y-1.5 pb-1">
          {decision.explanation.map((line) => (
            <li key={line} className="flex gap-2 text-xs leading-relaxed text-fg-muted">
              <Info className="mt-0.5 size-3 shrink-0" /> {line}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

"use client";

import { ISSUERS, fmtShares, fmtUsd, shortAddress, type DataMode, type IssuerId, type RouteDecision } from "@fairfill/core/shared";
import clsx from "clsx";
import { ChevronLeft, Loader2, RotateCw } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useNow } from "../live";
import { IssuerMark } from "../primitives";
import { ExecutePanel } from "./execute-panel";
import { RouteResult } from "./route-result";
import { useWallet } from "./use-wallet";

const PRESETS = [20, 50, 100, 250];

type Step = "order" | "review" | "execute";
const STEPS: { id: Step; label: string }[] = [
  { id: "order", label: "Order" },
  { id: "review", label: "Review" },
  { id: "execute", label: "Execute" },
];

export function OrderTicket({ ticker, name, issuers, mode }: { ticker: string; name: string | null; issuers: IssuerId[]; mode: DataMode }) {
  const wallet = useWallet();
  const panel = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("order");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("20");
  const [held, setHeld] = useState<IssuerId>(issuers[0] ?? "bstocks");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ decision: RouteDecision; receipt: string | null } | null>(null);

  // Each step replaces the previous one, so keep the ticket's top in view when it changes.
  function go(next: Step) {
    setStep(next);
    requestAnimationFrame(() => {
      const el = panel.current;
      if (el && el.getBoundingClientRect().top < 72) el.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  function edit(update: () => void) {
    update();
    setResult(null);
  }

  async function submit(e?: { preventDefault(): void }) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body =
        side === "buy"
          ? { ticker, side, amountUsd: Number(amount), wallet: wallet.address }
          : { ticker, side, tokens: Number(amount), issuer: held, wallet: wallet.address };
      const res = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json);
      go("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const label = name ?? ticker;
  const decision = result?.decision ?? null;
  const current = STEPS.findIndex((s) => s.id === step);
  const summary = side === "buy" ? `Buy $${amount} of ${label}` : `Sell ${amount} ${ticker} (${ISSUERS[held].label})`;

  return (
    <div ref={panel} id="order-ticket" className="panel scroll-mt-20 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="eyebrow">Order ticket</h2>
        {wallet.address ? (
          <button onClick={wallet.disconnect} className="num rounded-md border border-line px-2 py-1 text-[11px] text-fg-muted hover:text-fg" title="Disconnect">
            {shortAddress(wallet.address)}
          </button>
        ) : null}
      </div>

      <ol aria-label="Progress" className="mt-3 grid grid-cols-3 gap-2">
        {STEPS.map((s, i) => {
          const reachable = i < current;
          const content = (
            <>
              <span className={clsx("block h-0.5 rounded-full", i <= current ? "bg-gold" : "bg-ink-700")} />
              <span className={clsx("mt-2 flex items-center gap-1.5 text-[11px]", i === current ? "text-fg" : i < current ? "text-fg-soft" : "text-fg-muted")}>
                <span className="num">{i + 1}</span> {s.label}
              </span>
            </>
          );
          return (
            <li key={s.id} aria-current={i === current ? "step" : undefined}>
              {reachable ? (
                <button type="button" onClick={() => go(s.id)} className="w-full text-left">
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>

      {step === "order" ? (
        <form onSubmit={submit} className="mt-4 space-y-4 animate-rise">
          <div role="radiogroup" aria-label="Side" className="grid grid-cols-2 gap-1 rounded-xl bg-ink-800 p-1">
            {(["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={side === s}
                onClick={() =>
                  edit(() => {
                    setSide(s);
                    setAmount(s === "buy" ? "20" : "0.1");
                  })
                }
                className={clsx("rounded-lg py-2 text-sm font-semibold capitalize transition", side === s ? "bg-gold text-ink-950" : "text-fg-muted hover:text-fg")}
              >
                {s}
              </button>
            ))}
          </div>

          {side === "sell" ? (
            <div>
              <p className="mb-2 text-xs text-fg-muted">Which version do you hold?</p>
              <div className="flex flex-wrap gap-1.5">
                {issuers.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => edit(() => setHeld(id))}
                    className={clsx(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition",
                      held === id ? "border-gold/60 bg-gold/10 text-fg" : "border-line text-fg-muted hover:text-fg",
                    )}
                  >
                    <IssuerMark issuer={id} tone={held === id ? "accent" : "default"} /> {ISSUERS[id].label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <label htmlFor="amount" className="text-xs text-fg-muted">
              {side === "buy" ? `Spend (USDT) on ${label}` : `Tokens to sell`}
            </label>
            <div className="mt-2 flex items-center rounded-xl border border-line-strong bg-ink-900 px-3 focus-within:border-gold/60">
              <span className="num text-lg text-fg-muted">{side === "buy" ? "$" : "#"}</span>
              <input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => edit(() => setAmount(e.target.value.replace(/[^0-9.]/g, "")))}
                className="num w-full bg-transparent px-2 py-3 text-2xl text-fg outline-none"
                aria-describedby="amount-hint"
              />
              <span className="num text-xs text-fg-muted">{side === "buy" ? "USDT" : "tokens"}</span>
            </div>
            {side === "buy" ? (
              <div className="mt-2 flex gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => edit(() => setAmount(String(p)))}
                    className={clsx(
                      "num flex-1 rounded-lg border py-1.5 text-xs transition",
                      amount === String(p) ? "border-gold/60 text-gold" : "border-line text-fg-muted hover:text-fg",
                    )}
                  >
                    ${p}
                  </button>
                ))}
              </div>
            ) : null}
            <p id="amount-hint" className="mt-2 text-[11px] leading-relaxed text-fg-muted">
              {wallet.address
                ? "Quoting with your wallet address, so RFQ venues (Ondo) are included."
                : "Connect a wallet in the Execute step to include RFQ venues in the quotes."}
            </p>
          </div>

          {result ? (
            <button
              type="button"
              onClick={() => go("review")}
              className="w-full rounded-xl border border-line-strong px-4 py-3 text-sm font-medium text-fg-soft transition hover:border-gold/50 hover:text-fg"
            >
              Back to the last quote
            </button>
          ) : null}
          <button
            type="submit"
            disabled={loading || !(Number(amount) > 0)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3.5 text-sm font-semibold text-ink-950 transition hover:bg-gold-bright disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {loading ? "Quoting every version…" : "Find the fair fill"}
          </button>
          {error ? <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">{error}</p> : null}
        </form>
      ) : null}

      {step === "review" && decision ? (
        <div className="mt-4 space-y-3">
          <StepBar onBack={() => go("order")} backLabel="Edit" title={summary}>
            <QuoteAge at={decision.createdAt} />
          </StepBar>

          {wallet.address && decision.order.wallet?.toLowerCase() !== wallet.address.toLowerCase() ? (
            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="w-full rounded-xl border border-gold/50 px-4 py-2.5 text-xs font-medium text-gold transition hover:bg-gold/10"
            >
              Wallet connected: re-quote including RFQ venues
            </button>
          ) : null}

          <RouteResult decision={decision} />

          {error ? <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">{error}</p> : null}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={loading}
              aria-label="Re-quote"
              title="Re-quote"
              className="grid size-12 place-items-center rounded-xl border border-line-strong text-fg-soft transition hover:border-gold/50 hover:text-fg disabled:opacity-50"
            >
              <RotateCw className={clsx("size-4", loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={() => go("execute")}
              disabled={!decision.best || loading}
              className="rounded-xl bg-gold px-4 text-sm font-semibold text-ink-950 transition hover:bg-gold-bright disabled:opacity-50"
            >
              Continue to execution
            </button>
          </div>
        </div>
      ) : null}

      {step === "execute" && decision?.best ? (
        <div className="mt-4 space-y-3 animate-rise">
          <StepBar onBack={() => go("review")} backLabel="Review" title={summary}>
            <span className="flex items-center gap-1.5">
              <IssuerMark issuer={decision.best.version.issuer} tone="accent" size={8} />
              <span className="num text-fg-soft">{decision.best.version.symbol}</span>
              <span className="num">
                {fmtShares(decision.best.shares)} sh · {fmtUsd(decision.best.effectivePerShareUsd)}
              </span>
            </span>
          </StepBar>
          <ExecutePanel decision={decision} receipt={result?.receipt ?? null} mode={mode} wallet={wallet} />
        </div>
      ) : null}
    </div>
  );
}

function StepBar({ onBack, backLabel, title, children }: { onBack: () => void; backLabel: string; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-ink-800 p-3">
      <button
        type="button"
        onClick={onBack}
        className="flex shrink-0 items-center gap-0.5 rounded-md border border-line px-1.5 py-1 text-[11px] text-fg-muted transition hover:text-fg"
      >
        <ChevronLeft className="size-3.5" /> {backLabel}
      </button>
      <div className="min-w-0 text-xs">
        <p className="truncate font-medium text-fg">{title}</p>
        <div className="mt-0.5 text-[11px] text-fg-muted">{children}</div>
      </div>
    </div>
  );
}

function QuoteAge({ at }: { at: number }) {
  const now = useNow(1000);
  const s = Math.max(0, Math.round((now - at) / 1000));
  return <span className="num">Quoted {s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`} ago</span>;
}

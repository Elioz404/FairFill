"use client";

import { ISSUERS, shortAddress, type DataMode, type IssuerId, type RouteDecision } from "@fairfill/core/shared";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { IssuerMark } from "../primitives";
import { ExecutePanel } from "./execute-panel";
import { RouteResult } from "./route-result";
import { useWallet } from "./use-wallet";

const PRESETS = [20, 50, 100, 250];

export function OrderTicket({ ticker, name, issuers, mode }: { ticker: string; name: string | null; issuers: IssuerId[]; mode: DataMode }) {
  const wallet = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("20");
  const [held, setHeld] = useState<IssuerId>(issuers[0] ?? "bstocks");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ decision: RouteDecision; receipt: string | null } | null>(null);

  async function submit(e?: { preventDefault(): void }) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body =
        side === "buy"
          ? { ticker, side, amountUsd: Number(amount), wallet: wallet.address }
          : { ticker, side, tokens: Number(amount), issuer: held, wallet: wallet.address };
      const res = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const label = name ?? ticker;
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Order ticket</p>
        {wallet.address ? (
          <button onClick={wallet.disconnect} className="num rounded-md border border-line px-2 py-1 text-[11px] text-fg-muted hover:text-fg" title="Disconnect">
            {shortAddress(wallet.address)}
          </button>
        ) : null}
      </div>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div role="radiogroup" aria-label="Side" className="grid grid-cols-2 gap-1 rounded-xl bg-ink-800 p-1">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={side === s}
              onClick={() => {
                setSide(s);
                setResult(null);
                setAmount(s === "buy" ? "20" : "0.1");
              }}
              className={clsx(
                "rounded-lg py-2 text-sm font-semibold capitalize transition",
                side === s ? "bg-gold text-ink-950" : "text-fg-muted hover:text-fg",
              )}
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
                  onClick={() => setHeld(id)}
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
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
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
                  onClick={() => setAmount(String(p))}
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
              : "Connect a wallet in the execution panel to include RFQ venues in the quotes."}
          </p>
        </div>

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

      {result ? (
        <div className="mt-6 space-y-5 border-t border-line pt-5">
          {wallet.address && result.decision.order.wallet?.toLowerCase() !== wallet.address.toLowerCase() ? (
            <button
              type="button"
              onClick={submit}
              className="w-full rounded-xl border border-gold/50 px-4 py-2.5 text-xs font-medium text-gold transition hover:bg-gold/10"
            >
              Wallet connected — re-quote including RFQ venues
            </button>
          ) : null}
          <RouteResult decision={result.decision} />
          <ExecutePanel decision={result.decision} receipt={result.receipt} mode={mode} wallet={wallet} />
        </div>
      ) : null}
    </div>
  );
}

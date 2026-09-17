"use client";

import {
  ISSUERS,
  fmtBps,
  fmtCompactUsd,
  fmtShares,
  fmtUsd,
  shortAddress,
  type DataMode,
  type IssuerId,
  type RouteDecision,
  type StockVersion,
  type VenueAssessment,
} from "@fairfill/core/shared";
import clsx from "clsx";
import { AlertTriangle, ArrowDownUp, Check, ChevronDown, Info, Loader2, Wallet } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatedNumber, useNow } from "../live";
import { Modal } from "../modal";
import { IssuerMark, LiquidityMeter, Stamp, verdictOf } from "../primitives";
import { StockLogo } from "../stock-logo";
import { ExecutePanel } from "./execute-panel";
import { UsdtIcon, VersionIcon } from "./token-icon";
import { useWallet } from "./use-wallet";

type Side = "buy" | "sell";

const PRESETS = [20, 50, 100, 250];
const REFRESH_MS = 20_000;
const DEBOUNCE_MS = 450;

interface Quoted {
  decision: RouteDecision;
  receipt: string | null;
  receivedAt: number;
}

/** What the user gets from a venue: tokens on a buy, USDT on a sell. */
function amountOut(v: VenueAssessment, side: Side): number | null {
  if (v.quote?.ok) return v.quote.best.amountOutDecimal;
  if (v.shares === null) return null;
  if (side === "buy") return v.shares / v.version.shareRatio;
  return v.effectivePerShareUsd === null ? null : v.shares * v.effectivePerShareUsd;
}

function quoteLabel(v: VenueAssessment): string {
  if (v.indicative || !v.quote?.ok) return "Indicative (displayed on-chain price)";
  return `${v.quote.best.mode === "RFQ" ? "RFQ" : "Swap"} via ${v.quote.best.vendor}`;
}

/** The fee is already inside the all-in price; this row only makes it visible. */
function feeLabel(percent: number, v: VenueAssessment): string {
  const fee = v.quote?.ok ? v.quote.best.feeUsd : null;
  if (fee !== null && fee > 0) return `${percent}% · ${fmtUsd(fee)}`;
  return v.quote?.ok && v.quote.best.mode === "RFQ" ? "None on RFQ routes" : "None";
}

const BENCHMARK_SOURCE: Record<string, string> = {
  "us-market": "US market",
  "onchain-consensus": "on-chain consensus",
  unavailable: "unavailable",
};

export function TradeCard({
  ticker,
  name,
  logoUrl,
  versions,
  referenceUsd,
  mode,
}: {
  ticker: string;
  name: string | null;
  logoUrl: string | null;
  versions: StockVersion[];
  referenceUsd: number | null;
  mode: DataMode;
}) {
  const wallet = useWallet();
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("20");
  const [held, setHeld] = useState<IssuerId>(versions[0]?.issuer ?? "bstocks");
  const [pick, setPick] = useState<string | null>(null);
  const [quoted, setQuoted] = useState<Quoted | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [modal, setModal] = useState<"compare" | "review" | null>(null);
  const [details, setDetails] = useState(false);

  const qty = Number(amount);
  const valid = Number.isFinite(qty) && qty > 0;

  // Quote as the user types, like a swap box. The previous quote stays on screen, dimmed, until the new one lands.
  useEffect(() => {
    if (!valid) {
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const body =
          side === "buy"
            ? { ticker, side, amountUsd: qty, wallet: wallet.address }
            : { ticker, side, tokens: qty, issuer: held, wallet: wallet.address };
        const res = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setQuoted({ decision: json.decision, receipt: json.receipt, receivedAt: Date.now() });
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ticker, side, qty, valid, held, wallet.address, nonce]);

  // Keep the quote fresh while the card is idle; pause while a dialog is open so nothing moves under the user.
  useEffect(() => {
    if (!quoted || modal) return;
    const refresh = () => setNonce((n) => n + 1);
    let onVisible: (() => void) | null = null;
    const timer = setTimeout(
      () => {
        if (!document.hidden) return refresh();
        onVisible = () => {
          if (!document.hidden) refresh();
        };
        document.addEventListener("visibilitychange", onVisible, { once: true });
      },
      Math.max(1_000, REFRESH_MS - (Date.now() - quoted.receivedAt)),
    );
    return () => {
      clearTimeout(timer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, [quoted, modal]);

  const decision = quoted?.decision ?? null;
  const fresh =
    !!decision &&
    decision.order.side === side &&
    (side === "buy" ? decision.order.amountUsd === qty : decision.order.tokens === qty && decision.order.issuer === held);
  const best = fresh ? decision.best : null;
  const chosen = (fresh && pick ? decision.ranked.find((v) => v.version.address === pick) : null) ?? best;
  const override = !!chosen && !!best && chosen.version.address !== best.version.address;
  const execDecision = fresh && chosen ? (override ? { ...decision, best: chosen } : decision) : null;
  const out = chosen ? amountOut(chosen, side) : null;
  const reference = decision?.benchmark.priceUsd ?? referenceUsd;
  const heldVersion = versions.find((v) => v.issuer === held) ?? versions[0];
  // A background refresh keeps the current quote usable; only changed inputs make it stale.
  const stale = !fresh;

  function switchSide(next: Side) {
    if (next === side) return;
    if (next === "sell") {
      const tokens = chosen ? amountOut(chosen, "buy") : null;
      if (chosen) setHeld(chosen.version.issuer);
      setAmount(tokens ? String(Number(tokens.toPrecision(4))) : "0.1");
    } else {
      const usdt = chosen ? amountOut(chosen, "sell") : null;
      setAmount(usdt ? String(Math.max(1, Math.round(usdt))) : "20");
    }
    setSide(next);
    setPick(null);
    setDetails(false);
  }

  const payUsd = side === "buy" ? (valid ? qty : null) : valid && reference ? qty * (heldVersion?.shareRatio ?? 1) * reference : null;
  const receiveUsd = side === "buy" ? (chosen?.shares && reference ? chosen.shares * reference : null) : out;

  let cta: { label: string; disabled: boolean; spin?: boolean; onClick?: () => void };
  if (!valid) cta = { label: "Enter an amount", disabled: true };
  else if (error && !loading && !fresh) cta = { label: "Try again", disabled: false, onClick: () => setNonce((n) => n + 1) };
  else if (stale) cta = { label: decision ? "Updating quote…" : "Finding the fair fill…", disabled: true, spin: loading };
  else if (!chosen) cta = { label: "No version can fill right now", disabled: true };
  else
    cta = {
      label: `${side === "buy" ? "Buy" : "Sell"} ${chosen.version.symbol}`,
      disabled: false,
      onClick: () => {
        // Open the review on a quote that is as fresh as the card's own refresh cycle.
        if (quoted && Date.now() - quoted.receivedAt > REFRESH_MS / 2) setNonce((n) => n + 1);
        setModal("review");
      },
    };

  const versionsCompared = decision ? [...decision.ranked, ...decision.excluded].filter((v) => v.excluded?.code !== "NOT_HELD") : [];

  return (
    <div id="trade" className="panel scroll-mt-20 p-4">
      <div className="flex items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Side" className="grid grid-cols-2 gap-1 rounded-xl bg-ink-850 p-1">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={side === s}
              onClick={() => switchSide(s)}
              className={clsx(
                "rounded-lg px-5 py-1.5 text-sm font-semibold capitalize transition",
                side === s ? "bg-gold text-ink-950" : "text-fg-muted hover:text-fg",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <RefreshRing receivedAt={fresh ? (quoted?.receivedAt ?? null) : null} loading={loading && valid} onRefresh={() => setNonce((n) => n + 1)} />
          <WalletButton wallet={wallet} />
        </div>
      </div>

      {/* You pay */}
      <div className="mt-3 rounded-2xl border border-line bg-ink-900 p-4 transition-colors focus-within:border-gold/50">
        <div className="flex items-center justify-between text-xs text-fg-muted">
          <label htmlFor="trade-amount">You pay</label>
          {side === "buy" ? <span>BNB Smart Chain</span> : <span className="num">{fmtShares(valid && heldVersion ? qty * heldVersion.shareRatio : null)} shares</span>}
        </div>
        <div className="mt-2 flex items-center gap-3">
          {side === "buy" ? (
            <TokenPill icon={<UsdtIcon />} symbol="USDT" caption="Tether USD" />
          ) : (
            <HeldMenu versions={versions} held={held} ticker={ticker} logoUrl={logoUrl} onChange={(id) => setHeld(id)} />
          )}
          <input
            id="trade-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="num min-w-0 flex-1 bg-transparent text-right text-3xl text-fg outline-none placeholder:text-fg-faint"
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          {side === "buy" ? (
            <div className="flex gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(String(p))}
                  className={clsx(
                    "num rounded-md border px-1.5 py-0.5 text-[11px] transition",
                    amount === String(p) ? "border-gold/60 text-gold" : "border-line text-fg-muted hover:text-fg",
                  )}
                >
                  ${p}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-fg-muted">{heldVersion ? `${ISSUERS[heldVersion.issuer].label} version` : null}</span>
          )}
          <span className="num shrink-0 text-xs text-fg-muted">≈ {fmtUsd(payUsd)}</span>
        </div>
      </div>

      <div className="relative z-10 -my-2.5 flex justify-center">
        <button
          type="button"
          onClick={() => switchSide(side === "buy" ? "sell" : "buy")}
          aria-label={side === "buy" ? "Switch to sell" : "Switch to buy"}
          className="grid size-9 place-items-center rounded-xl border-4 border-ink-800 bg-ink-750 text-fg-soft transition hover:rotate-180 hover:text-gold"
        >
          <ArrowDownUp className="size-4" />
        </button>
      </div>

      {/* You receive */}
      <div className="rounded-2xl border border-line bg-ink-900 p-4">
        <div className="flex items-center justify-between text-xs text-fg-muted">
          <span>You receive</span>
          {side === "buy" && chosen ? (
            override ? (
              <Stamp tone="neutral">Your pick</Stamp>
            ) : (
              <Stamp tone="gold">Fair fill</Stamp>
            )
          ) : side === "buy" ? (
            <span>Best of {versions.length} versions</span>
          ) : (
            <span>BNB Smart Chain</span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3">
          {side === "buy" ? (
            <button
              type="button"
              disabled={!fresh}
              onClick={() => setModal("compare")}
              className="flex shrink-0 items-center gap-2 rounded-full border border-line-strong bg-ink-800 py-1 pl-1 pr-2.5 transition hover:border-gold/50 disabled:cursor-default disabled:hover:border-line-strong"
            >
              {chosen ? (
                <VersionIcon ticker={ticker} logoUrl={logoUrl} issuer={chosen.version.issuer} accent={!override} />
              ) : (
                <StockLogo ticker={ticker} logoUrl={logoUrl} size="sm" />
              )}
              <span className="text-left leading-tight">
                <span className="num block text-sm font-semibold">{chosen?.version.symbol ?? ticker}</span>
                <span className="block text-[10px] text-fg-muted">{chosen ? ISSUERS[chosen.version.issuer].label : "Choosing…"}</span>
              </span>
              <ChevronDown className="size-3.5 text-fg-muted" />
            </button>
          ) : (
            <TokenPill icon={<UsdtIcon />} symbol="USDT" caption="Tether USD" />
          )}
          <div className={clsx("min-w-0 flex-1 truncate text-right transition-opacity", stale && decision && "opacity-40")}>
            {valid && out !== null ? (
              <AnimatedNumber value={out} format={fmtShares} className="num text-3xl text-fg" />
            ) : (
              <span className="num text-3xl text-fg-faint">{valid && stale ? "…" : "0"}</span>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-fg-muted">
          <span className="num">{side === "buy" && chosen?.shares ? `${fmtShares(chosen.shares)} shares` : side === "buy" ? "" : "Stablecoin"}</span>
          <span className="num shrink-0">≈ {fmtUsd(receiveUsd)}</span>
        </div>
      </div>

      {/* Price line and details */}
      {chosen ? (
        <div className={clsx("mt-3 rounded-xl border border-line px-3 transition-opacity", stale && "opacity-50")}>
          <button type="button" onClick={() => setDetails((v) => !v)} aria-expanded={details} className="flex w-full items-center gap-2 py-2.5 text-xs">
            <span className="num text-fg-soft">1 share = {fmtUsd(chosen.effectivePerShareUsd)}</span>
            <span className={clsx("num ml-auto", chosen.costBps !== null && chosen.costBps > 25 ? "text-gold" : "text-fg-muted")}>
              {fmtBps(chosen.costBps)} vs ref
            </span>
            <ChevronDown className={clsx("size-3.5 text-fg-muted transition-transform", details && "rotate-180")} />
          </button>
          {details && decision ? (
            <div className="space-y-2 border-t border-line pb-3 pt-3 text-xs animate-rise">
              <Row label="Fair reference">
                {fmtUsd(decision.benchmark.priceUsd)} <span className="text-fg-muted">· {BENCHMARK_SOURCE[decision.benchmark.source]}</span>
              </Row>
              <Row label={side === "buy" ? "All-in per share" : "Net per share"}>{fmtUsd(chosen.effectivePerShareUsd)}</Row>
              <Row label="Version gap">{decision.spreadBps === null ? "—" : fmtBps(decision.spreadBps).replace("+", "")}</Row>
              <Row label="Quote">{quoteLabel(chosen)}</Row>
              {chosen.quote?.ok && chosen.quote.best.priceImpactPct !== null ? <Row label="Price impact">{chosen.quote.best.priceImpactPct.toFixed(2)}%</Row> : null}
              {chosen.quote?.ok ? <Row label="Network fee">{fmtUsd(chosen.quote.best.networkFeeUsd)}</Row> : null}
              {decision?.fee ? <Row label="FairFill fee">{feeLabel(decision.fee.percent, chosen)}</Row> : null}
              <Row label="Execution">{ISSUERS[chosen.version.issuer].executionLabel}</Row>
              <ul className="space-y-1.5 border-t border-line pt-2">
                {decision.explanation.map((line) => (
                  <li key={line} className="flex gap-2 leading-relaxed text-fg-muted">
                    <Info className="mt-0.5 size-3 shrink-0" /> {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {fresh && decision.warnings.length ? (
        <ul className="mt-3 space-y-1.5">
          {decision.warnings.map((w) => (
            <li key={w} className="flex gap-2 text-[11px] leading-relaxed text-fg-muted">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-gold" /> {w}
            </li>
          ))}
        </ul>
      ) : null}
      {error && !loading ? <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-xs text-danger">{error}</p> : null}

      <button
        type="button"
        disabled={cta.disabled}
        onClick={cta.onClick}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3.5 text-sm font-semibold text-ink-950 transition hover:bg-gold-bright disabled:bg-ink-750 disabled:text-fg-muted"
      >
        {cta.spin ? <Loader2 className="size-4 animate-spin" /> : null}
        {cta.label}
      </button>
      {mode === "live" && !wallet.address ? (
        <p className="mt-2 text-center text-[11px] text-fg-muted">Connect a wallet to include RFQ venues (Ondo) in the quotes.</p>
      ) : null}

      <Modal
        open={modal === "compare" && !!decision}
        onClose={() => setModal(null)}
        title={`Compare ${name ?? ticker} versions`}
        subtitle={decision ? `Fair reference ${fmtUsd(decision.benchmark.priceUsd)} · ${BENCHMARK_SOURCE[decision.benchmark.source]}` : null}
        wide
      >
        <ul className="space-y-2">
          {versionsCompared.map((v, i) => {
            const isBest = v.version.address === best?.version.address;
            const isChosen = v.version.address === chosen?.version.address;
            const received = amountOut(v, side);
            return (
              <li
                key={v.version.address}
                className={clsx("rounded-xl border p-3", isChosen ? "border-gold/60 bg-ink-800" : "border-line", v.excluded && "bg-ink-900/60")}
              >
                <div className="flex items-center gap-3">
                  <VersionIcon ticker={ticker} logoUrl={logoUrl} issuer={v.version.issuer} accent={isBest} />
                  <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="num text-xs text-fg-muted">{v.excluded ? "–" : `#${i + 1}`}</span>
                    <span className={clsx("num font-semibold", v.excluded ? "text-fg-muted" : "text-fg")}>{v.version.symbol}</span>
                    <span className="text-xs text-fg-muted">{ISSUERS[v.version.issuer].label}</span>
                    {isBest ? <Stamp tone="gold">Fair fill</Stamp> : null}
                  </p>
                  {v.excluded ? (
                    <Stamp tone="muted">{verdictOf(v).label}</Stamp>
                  ) : isChosen ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-gold">
                      <Check className="size-4" /> Selected
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPick(isBest ? null : v.version.address);
                        setModal(null);
                      }}
                      className="shrink-0 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs text-fg-soft transition hover:border-gold/50 hover:text-fg"
                    >
                      Select
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pl-11 text-[11px] text-fg-muted">
                  <span className="flex items-center gap-2">
                    <LiquidityMeter usd={v.market.onchainVolume24hUsd} />
                    <span className="num">{fmtCompactUsd(v.market.onchainVolume24hUsd)} 24h</span>
                    <span>· {ISSUERS[v.version.issuer].executionLabel}</span>
                  </span>
                  {v.excluded ? null : (
                    // Token counts are not comparable across issuers (each has its own share ratio); shares are.
                    <span className="num ml-auto text-right">
                      <span className="text-sm text-fg">{side === "buy" ? fmtShares(v.shares) : fmtShares(received)}</span>{" "}
                      {side === "buy" ? `sh · ${fmtShares(received)} ${v.version.symbol}` : "USDT"} ·{" "}
                      <span className={isBest ? "text-gold" : "text-fg-soft"}>{fmtBps(v.costBps)}</span>
                    </span>
                  )}
                </div>
                {v.excluded ? <p className="mt-2 pl-11 text-[11px] leading-relaxed text-fg-muted">{v.excluded.reason}</p> : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-[11px] leading-relaxed text-fg-muted">
          FairFill compares shares, not tokens: each issuer&apos;s token stands for a slightly different number of shares. It picks the lowest
          all-in cost that can actually fill, and excludes versions with stale prices, closed markets or amounts below the minimum, even when
          their displayed price looks cheaper.
        </p>
      </Modal>

      <Modal
        open={modal === "review" && !!execDecision}
        onClose={() => setModal(null)}
        title={`Review ${side}`}
        subtitle={quoted ? <QuoteAge at={quoted.receivedAt} live={mode === "live"} /> : null}
      >
        {execDecision && chosen ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-ink-900 p-3">
              <SummaryLine
                label="You pay"
                icon={side === "buy" ? <UsdtIcon /> : <VersionIcon ticker={ticker} logoUrl={logoUrl} issuer={chosen.version.issuer} />}
                value={`${amount} ${side === "buy" ? "USDT" : chosen.version.symbol}`}
                note={fmtUsd(payUsd)}
              />
              <div className="my-1 ml-3.5 h-4 border-l border-dashed border-line-strong" />
              <SummaryLine
                label="You receive"
                icon={side === "buy" ? <VersionIcon ticker={ticker} logoUrl={logoUrl} issuer={chosen.version.issuer} accent /> : <UsdtIcon />}
                value={`${fmtShares(out)} ${side === "buy" ? chosen.version.symbol : "USDT"}`}
                note={side === "buy" ? `${fmtShares(chosen.shares)} shares · ${ISSUERS[chosen.version.issuer].label}` : fmtUsd(out)}
              />
            </div>

            {override && best ? (
              <p className="flex gap-2 rounded-lg border border-gold/40 bg-gold/5 p-3 text-xs leading-relaxed text-fg-soft">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-gold" />
                You picked {chosen.version.symbol}. The fair fill is {best.version.symbol}
                {chosen.costBps !== null && best.costBps !== null ? `, ${Math.round(chosen.costBps - best.costBps)} bps cheaper` : ""}. No
                execution receipt is issued for a manual pick.
              </p>
            ) : null}

            <div className="space-y-2 text-xs">
              <Row label={side === "buy" ? "All-in per share" : "Net per share"}>{fmtUsd(chosen.effectivePerShareUsd)}</Row>
              <Row label="vs fair reference">{fmtBps(chosen.costBps)}</Row>
              <Row label="Quote">{quoteLabel(chosen)}</Row>
              {chosen.quote?.ok ? <Row label="Network fee">{fmtUsd(chosen.quote.best.networkFeeUsd)}</Row> : null}
              {decision?.fee ? <Row label="FairFill fee">{feeLabel(decision.fee.percent, chosen)}</Row> : null}
            </div>

            <div className="border-t border-line pt-4">
              <p className="eyebrow mb-3">Execute with</p>
              <ExecutePanel decision={execDecision} receipt={override ? null : (quoted?.receipt ?? null)} mode={mode} wallet={wallet} manualPick={override} />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-fg-muted">{label}</span>
      <span className="num min-w-0 truncate text-right text-fg-soft">{children}</span>
    </div>
  );
}

function TokenPill({ icon, symbol, caption }: { icon: ReactNode; symbol: string; caption: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-ink-800 py-1 pl-1 pr-3">
      {icon}
      <span className="leading-tight">
        <span className="num block text-sm font-semibold">{symbol}</span>
        <span className="block text-[10px] text-fg-muted">{caption}</span>
      </span>
    </span>
  );
}

function SummaryLine({ label, icon, value, note }: { label: string; icon: ReactNode; value: string; note: string }) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-fg-muted">{label}</p>
        <p className="num truncate text-lg text-fg">{value}</p>
      </div>
      <span className="num shrink-0 text-xs text-fg-muted">{note}</span>
    </div>
  );
}

function HeldMenu({
  versions,
  held,
  ticker,
  logoUrl,
  onChange,
}: {
  versions: StockVersion[];
  held: IssuerId;
  ticker: string;
  logoUrl: string | null;
  onChange: (id: IssuerId) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = versions.find((v) => v.issuer === held) ?? versions[0];
  useOutside(root, open, () => setOpen(false));
  if (!current) return null;
  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-line-strong bg-ink-800 py-1 pl-1 pr-2.5 transition hover:border-gold/50"
      >
        <VersionIcon ticker={ticker} logoUrl={logoUrl} issuer={current.issuer} />
        <span className="text-left leading-tight">
          <span className="num block text-sm font-semibold">{current.symbol}</span>
          <span className="block text-[10px] text-fg-muted">{ISSUERS[current.issuer].label}</span>
        </span>
        <ChevronDown className="size-3.5 text-fg-muted" />
      </button>
      {open ? (
        <ul role="listbox" aria-label="Version you hold" className="panel absolute left-0 top-full z-30 mt-2 w-56 border-line-strong p-1 shadow-2xl animate-rise">
          {versions.map((v) => (
            <li key={v.address}>
              <button
                type="button"
                role="option"
                aria-selected={v.issuer === held}
                onClick={() => {
                  onChange(v.issuer);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-ink-750"
              >
                <IssuerMark issuer={v.issuer} tone={v.issuer === held ? "accent" : "default"} />
                <span className="num">{v.symbol}</span>
                <span className="text-xs text-fg-muted">{ISSUERS[v.issuer].label}</span>
                {v.issuer === held ? <Check className="ml-auto size-3.5 text-gold" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WalletButton({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useOutside(root, open, () => setOpen(false));

  if (wallet.address) {
    return (
      <button
        type="button"
        onClick={wallet.disconnect}
        title="Disconnect"
        className="num flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[11px] text-fg-soft transition hover:text-fg"
      >
        <span className="size-1.5 rounded-full bg-gold" /> {shortAddress(wallet.address)}
      </button>
    );
  }
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs text-fg-soft transition hover:border-gold/50 hover:text-fg"
      >
        <Wallet className="size-3.5" /> Connect
      </button>
      {open ? (
        <div className="panel absolute right-0 top-full z-30 mt-2 w-60 border-line-strong p-2 shadow-2xl animate-rise">
          {wallet.wallets.length === 0 ? (
            <p className="p-2 text-xs leading-relaxed text-fg-muted">No browser wallet found. Install Binance Wallet, Trust Wallet or MetaMask.</p>
          ) : (
            wallet.wallets.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  void wallet.connect(w);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-ink-750"
              >
                {w.icon ? <img src={w.icon} alt="" className="size-5 rounded" /> : <Wallet className="size-5 text-fg-muted" />}
                {w.name}
              </button>
            ))
          )}
          {wallet.error ? <p className="p-2 text-xs text-danger">{wallet.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function RefreshRing({ receivedAt, loading, onRefresh }: { receivedAt: number | null; loading: boolean; onRefresh: () => void }) {
  const now = useNow(500);
  const progress = receivedAt ? Math.min(1, Math.max(0, (now - receivedAt) / REFRESH_MS)) : 1;
  const circumference = 2 * Math.PI * 7;
  return (
    <button
      type="button"
      onClick={onRefresh}
      aria-label="Refresh quote"
      title={receivedAt ? `Quote refreshes in ${Math.ceil((1 - progress) * (REFRESH_MS / 1000))}s` : "Refresh quote"}
      className="grid size-8 place-items-center rounded-lg text-fg-muted transition hover:bg-ink-750 hover:text-fg"
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <svg viewBox="0 0 18 18" className="size-[18px] -rotate-90" aria-hidden>
          <circle cx="9" cy="9" r="7" fill="none" stroke="var(--color-ink-700)" strokeWidth="2" />
          <circle
            cx="9"
            cy="9"
            r="7"
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * progress}
            className="transition-[stroke-dashoffset] duration-500 ease-linear"
          />
        </svg>
      )}
    </button>
  );
}

function QuoteAge({ at, live }: { at: number; live: boolean }) {
  const now = useNow(1000);
  const s = Math.max(0, Math.round((now - at) / 1000));
  return (
    <span className="num">
      Quoted {s}s ago · {live ? "a fresh quote is taken again right before you sign" : "indicative prices, nothing can be signed in preview"}
    </span>
  );
}

function useOutside(ref: RefObject<HTMLElement | null>, active: boolean, onOutside: () => void) {
  useEffect(() => {
    if (!active) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOutside();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOutside();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, active, onOutside]);
}

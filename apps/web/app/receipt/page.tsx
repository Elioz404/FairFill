import { BSCTRACE_TOKEN, BSCTRACE_TX, ISSUERS, decodeReceipt, fmtBps, fmtShares, fmtUsd, realisedCostBps, shortAddress } from "@fairfill/core/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { LogoMark } from "@/components/logo";
import { getEngine } from "@/lib/server";

export const metadata: Metadata = { title: "Execution receipt" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-paper-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

async function onChainStatus(tx: string | null, order: string | null) {
  const engine = getEngine();
  if (engine.mode !== "live") return null;
  try {
    if (order) {
      const o = await engine.rfqOrder(order);
      return { label: `RFQ ${o.status}`, ok: o.status === "FILLED" };
    }
    if (tx) {
      const d = await engine.txDetail(tx);
      const first = d[0];
      return first ? { label: first.txStatus.toUpperCase(), ok: first.txStatus === "success" } : { label: "NOT INDEXED YET", ok: false };
    }
  } catch {
    return { label: "STATUS UNAVAILABLE", ok: false };
  }
  return null;
}

export default async function ReceiptPage(props: PageProps<"/receipt">) {
  await connection();
  const sp = await props.searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const snap = decodeReceipt(pick("d") ?? "");
  const tx = pick("tx");
  const order = pick("order");
  const out = pick("out");

  if (!snap) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="heading text-4xl">No receipt here.</h1>
        <p className="mt-3 text-fg-muted">This link is missing its receipt data.</p>
        <Link href="/" className="mt-6 inline-block text-gold">← Back to the tape</Link>
      </div>
    );
  }

  const filled = out ? Number(out) : null;
  const realised = filled ? realisedCostBps(snap, snap.side === "buy" ? { tokensOut: filled } : { usdOut: filled }) : null;
  const status = await onChainStatus(tx && /^0x[0-9a-fA-F]{64}$/.test(tx) ? tx : null, order);
  const decided = new Date(snap.decidedAt);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-12 sm:px-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="eyebrow">Execution receipt</p>
          <h1 className="heading mt-2 text-4xl sm:text-5xl">
            {snap.side === "buy" ? "Bought" : "Sold"} {snap.ticker}
            {realised === null ? (
              "."
            ) : realised <= 25 ? (
              <>
                , <span className="text-gold">fairly</span>.
              </>
            ) : (
              <>
                {" "}<span className="text-fg-muted">above the reference.</span>
              </>
            )}
          </h1>
        </div>
        <CopyButton value={`${getEngine().config.baseUrl}/receipt?${new URLSearchParams(Object.entries({ d: pick("d"), tx, order, out }).filter((e): e is [string, string] => !!e[1])).toString()}`} label="Copy link" />
      </div>

      <div className="receipt mx-auto max-w-md px-7 pb-10 pt-8 font-mono text-[13px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LogoMark className="size-6" />
            <span className="font-sans text-sm font-semibold tracking-tight">FairFill</span>
          </div>
          {status ? (
            <span
              className={`rounded border px-2 py-0.5 text-[10px] font-bold tracking-widest ${status.ok ? "border-paper-ink text-paper-ink" : "border-paper-muted text-paper-muted"}`}
            >
              {status.label}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-[11px] text-paper-muted">
          {decided.toUTCString()} · BNB Smart Chain
        </p>

        <div className="receipt-rule my-4" />
        <Row label="Stock">{snap.ticker}</Row>
        <Row label="Version">
          {snap.symbol} · {ISSUERS[snap.issuer].label}
        </Row>
        <Row label="Contract">
          <a className="underline decoration-dotted" href={BSCTRACE_TOKEN(snap.address)} target="_blank" rel="noreferrer">
            {shortAddress(snap.address)}
          </a>
        </Row>
        <Row label="Side">{snap.side.toUpperCase()}</Row>
        {snap.amountUsd !== null ? <Row label="Spent">{fmtUsd(snap.amountUsd)} USDT</Row> : null}
        {snap.tokens !== null ? <Row label="Sold">{snap.tokens} tokens</Row> : null}

        <div className="receipt-rule my-4" />
        <Row label="Fair reference">{fmtUsd(snap.benchmarkUsd)}</Row>
        <Row label="Reference source">{snap.benchmarkSource === "us-market" ? "US market" : "on-chain consensus"}</Row>
        <Row label="Expected shares">{fmtShares(snap.expectedShares)}</Row>
        <Row label="Expected vs ref.">{fmtBps(snap.expectedCostBps)}</Row>
        {filled !== null ? <Row label={snap.side === "buy" ? "Received" : "Received USDT"}>{filled}</Row> : null}
        {realised !== null ? (
          <Row label="Realised vs ref.">
            <span className="font-bold">{fmtBps(realised)}</span>
          </Row>
        ) : null}

        {snap.alternatives.length ? (
          <>
            <div className="receipt-rule my-4" />
            <p className="mb-1 text-[11px] uppercase tracking-widest text-paper-muted">Other versions considered</p>
            {snap.alternatives.map((alt) => (
              <div key={alt.symbol} className="py-1.5">
                <div className="flex justify-between">
                  <span>
                    {alt.symbol} · {ISSUERS[alt.issuer].label}
                  </span>
                  <span>{alt.excluded ? "excluded" : fmtBps(alt.costBps)}</span>
                </div>
                {alt.excluded ? <p className="mt-0.5 font-sans text-[11px] leading-snug text-paper-muted">{alt.excluded}</p> : null}
              </div>
            ))}
          </>
        ) : null}

        <div className="receipt-rule my-4" />
        {tx ? (
          <Row label="Tx">
            <a className="underline decoration-dotted" href={BSCTRACE_TX(tx)} target="_blank" rel="noreferrer">
              {shortAddress(tx)}
            </a>
          </Row>
        ) : null}
        {order ? <Row label="RFQ order">{shortAddress(order)}</Row> : null}
        <p className="mt-6 text-center text-[11px] leading-relaxed text-paper-muted">
          Positive basis points = worse than the reference.
          <br />
          Not investment advice.
        </p>
      </div>
    </div>
  );
}

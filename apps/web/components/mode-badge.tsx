"use client";

import type { DataMode } from "@fairfill/core/shared";
import clsx from "clsx";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface KeyIssueInfo {
  code: number | string | null;
  message: string;
}

interface Copy {
  title: string;
  lead: ReactNode;
  rows: [string, string][];
  foot: ReactNode;
}

const COPY: Record<DataMode, Copy> = {
  preview: {
    title: "Preview mode",
    lead: "This server has no Binance Web3 API keys, so it runs on Binance's public, keyless market data.",
    rows: [
      ["Real", "Catalog of all three issuers, US reference price, 24h charts and on-chain volume."],
      ["Indicative", "Version prices are displayed on-chain prices, not executable quotes."],
      ["Off", "Swap and RFQ quotes, simulation and browser-wallet execution."],
    ],
    foot: (
      <>
        Set <code className="num text-fg-soft">BINANCE_WEB3_API_KEY</code> and <code className="num text-fg-soft">BINANCE_WEB3_SECRET_KEY</code> on the
        server to switch to Live.
      </>
    ),
  },
  live: {
    title: "Live mode",
    lead: "This server signs requests to the Binance Web3 API with its own keys.",
    rows: [
      ["Quotes", "Executable AMM and RFQ quotes from the Trading API for every version."],
      ["Checks", "Swaps are simulated with the Transaction API before you sign."],
      ["Custody", "None. Your wallet signs; the server never holds funds or private keys."],
    ],
    foot: "Data refreshes on its own while the page is open.",
  },
};

function rejectedCopy(issue: KeyIssueInfo): Copy {
  return {
    title: "Live keys rejected",
    lead: (
      <>
        This server has Binance Web3 API keys, but the gateway answered{" "}
        <code className="num text-fg-soft">
          {issue.code}: {issue.message}
        </code>
        . FairFill fell back to public data.
      </>
    ),
    rows: COPY.preview.rows,
    foot: "The key has to come from a project in the Binance Web3 Developer Portal (API Key Management). Update the server's .env and restart it.",
  };
}

/** Data-mode badge in the header. Opens a short explanation of what the mode means. */
export function ModeBadge({ mode, keyIssue = null }: { mode: DataMode; keyIssue?: KeyIssueInfo | null }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const live = mode === "live";
  const rejected = !live && keyIssue !== null;
  const copy = rejected ? rejectedCopy(keyIssue) : COPY[mode];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] transition",
          live || rejected ? "border-gold/40 text-gold hover:border-gold/70" : "border-line-strong text-fg-muted hover:text-fg",
        )}
      >
        {live ? <span className="size-1.5 rounded-full bg-gold animate-pulse-dot" /> : null}
        {rejected ? <AlertTriangle className="size-3" /> : null}
        {live ? "LIVE" : "PREVIEW"}
        <ChevronDown className={clsx("size-3 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div id={id} role="dialog" aria-label={copy.title} className="panel absolute right-0 top-full z-50 border-line-strong mt-2 w-[min(20rem,calc(100vw-2rem))] p-4 shadow-2xl animate-rise">
          <p className="text-sm font-semibold text-fg">{copy.title}</p>
          <p className="mt-1.5 break-words text-xs leading-relaxed text-fg-muted">{copy.lead}</p>
          <dl className="mt-3 space-y-2 border-t border-line pt-3 text-xs">
            {copy.rows.map(([term, text]) => (
              <div key={term} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
                <dt className="font-medium text-fg-soft">{term}</dt>
                <dd className="leading-relaxed text-fg-muted">{text}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 break-words rounded-lg bg-ink-900 p-2.5 text-[11px] leading-relaxed text-fg-muted">{copy.foot}</p>
        </div>
      ) : null}
    </div>
  );
}

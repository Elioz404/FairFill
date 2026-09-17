"use client";

import { TOKENS, type DataMode, type RouteDecision } from "@fairfill/core/shared";
import clsx from "clsx";
import { Bot, Wallet } from "lucide-react";
import { useState } from "react";
import { CodeBlock } from "../copy-button";
import type { useWallet } from "./use-wallet";
import { WalletExecutor } from "./wallet-executor";

type WalletState = ReturnType<typeof useWallet>;

export function ExecutePanel({
  decision,
  receipt,
  mode,
  wallet,
  manualPick = false,
}: {
  decision: RouteDecision;
  receipt: string | null;
  mode: DataMode;
  wallet: WalletState;
  /** The user chose this version over the fair fill, so the agent must not re-route. */
  manualPick?: boolean;
}) {
  // Live servers can build and simulate the transaction, so the browser wallet leads there.
  const [tab, setTab] = useState<"agent" | "browser">(mode === "live" ? "browser" : "agent");
  const best = decision.best;
  if (!best) return null;

  const side = decision.order.side;
  const qty = side === "buy" ? decision.order.amountUsd : decision.order.tokens;
  const from = side === "buy" ? TOKENS.USDT.address : best.version.address;
  const to = side === "buy" ? best.version.address : TOKENS.USDT.address;
  const name = decision.listing.name ?? decision.listing.ticker;
  const prompt =
    side === "sell"
      ? `Use FairFill to sell ${qty} ${best.version.symbol} for USDT with my Binance Agentic Wallet. Show me the quote before executing.`
      : manualPick
        ? `Buy $${qty} of ${best.version.symbol} (${name}, ${best.version.address}) on BSC with my Binance Agentic Wallet. Use this exact token even if FairFill prefers another version. Show me the quote before executing.`
        : `Use FairFill to buy $${qty} of ${name} (${decision.listing.ticker}) on BSC, then fill the version it picks with my Binance Agentic Wallet. Show me the quote before executing.`;
  const commands = [
    `# quote only`,
    `baw market-order quote --fromTokenQty ${qty} --fromToken ${from} --toToken ${to} --binanceChainId 56 --json`,
    `# execute (the agent must confirm with you first)`,
    `baw market-order swap --fromTokenQty ${qty} --fromToken ${from} --toToken ${to} --binanceChainId 56 --json`,
    `# poll until FINISHED or FAILED`,
    `baw market-order list --orderId <orderId> --json`,
  ].join("\n");

  return (
    <div>
      <div role="tablist" aria-label="Execution method" className="grid grid-cols-2 gap-1 rounded-xl bg-ink-800 p-1">
        {[
          { id: "agent" as const, label: "Agentic Wallet", icon: Bot },
          { id: "browser" as const, label: "Browser wallet", icon: Wallet },
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
              tab === t.id ? "bg-ink-700 text-fg shadow" : "text-fg-muted hover:text-fg",
            )}
          >
            <t.icon className="size-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "agent" ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-relaxed text-fg-muted">
            Paste this into Codex, Hermes or any agent CLI with the FairFill and Binance Agentic Wallet skills installed. Your
            daily limit and token rules from the Binance App still apply.
          </p>
          <CodeBlock label="prompt" code={prompt} wrap />
          <details className="group">
            <summary className="cursor-pointer text-xs text-fg-muted hover:text-fg">Exact baw commands for this route</summary>
            <div className="mt-3">
              <CodeBlock label="baw cli" code={commands} />
            </div>
          </details>
        </div>
      ) : mode !== "live" ? (
        <p className="mt-4 rounded-lg border border-line bg-ink-800 p-3 text-xs leading-relaxed text-fg-soft">
          Browser execution needs Binance Web3 API keys on the server (quotes, swap building and simulation run there).
        </p>
      ) : !wallet.address || !wallet.active ? (
        <div className="mt-4 space-y-2">
          {wallet.wallets.length === 0 ? (
            <p className="text-xs text-fg-muted">No browser wallet detected. Install Binance Wallet, Trust Wallet or MetaMask.</p>
          ) : (
            wallet.wallets.map((w) => (
              <button
                key={w.id}
                onClick={() => wallet.connect(w)}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-ink-800 px-3 py-2.5 text-sm transition hover:border-gold/50"
              >
                {w.icon ? <img src={w.icon} alt="" className="size-5 rounded" /> : <Wallet className="size-5 text-fg-muted" />}
                Connect {w.name}
              </button>
            ))
          )}
          {wallet.error ? <p className="text-xs text-danger">{wallet.error}</p> : null}
        </div>
      ) : (
        <div className="mt-4">
          <WalletExecutor wallet={wallet.active} address={wallet.address} decision={decision} receipt={receipt} />
        </div>
      )}
    </div>
  );
}

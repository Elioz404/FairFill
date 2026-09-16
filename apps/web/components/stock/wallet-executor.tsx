"use client";

import { BSCTRACE_TX, TOKENS, fromBaseUnits, type RouteDecision, type RouteOption } from "@fairfill/core/shared";
import clsx from "clsx";
import { Check, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { createPublicClient, createWalletClient, custom, erc20Abi, hexToString, http, isHex, type Address, type Hex } from "viem";
import { bsc } from "viem/chains";
import type { InjectedWallet } from "./use-wallet";

interface BuiltExecution {
  fromToken: Address;
  toToken: Address;
  amountIn: string;
  route: RouteOption;
  executionMode: "SWAP" | "RFQ";
  tx: { from: Address; to: Address; data: Hex; value: string; gas: string; gasPrice: string; maxPriorityFeePerGas?: string | null } | null;
  rfq: { vendor: string; typedDataToSign: string; signingScheme?: string; orderId?: string } | null;
  simulation: { ok: boolean; status?: string; failReason?: string | null; error?: string } | null;
}

type StepId = "network" | "build" | "allowance" | "sign" | "settle";
type StepState = "idle" | "active" | "done" | "error" | "skipped";
const STEPS: { id: StepId; label: string }[] = [
  { id: "network", label: "Switch to BNB Smart Chain" },
  { id: "build", label: "Fresh quote + simulation" },
  { id: "allowance", label: "Token allowance" },
  { id: "sign", label: "Sign in your wallet" },
  { id: "settle", label: "Wait for settlement" },
];
const TERMINAL = new Set(["FILLED", "FAILED", "EXPIRED", "CANCELLED"]);

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as T & { error?: string; code?: string | number };
  if (!res.ok) throw new Error(json.code ? `${json.error} (${json.code})` : (json.error ?? `HTTP ${res.status}`));
  return json;
}

/** The API documents typedDataToSign as "a hex string (or JSON-encoded string)". */
function typedDataJson(raw: string): string {
  const text = raw.trim();
  if (text.startsWith("{")) return text;
  if (isHex(text)) {
    const decoded = hexToString(text as Hex);
    if (decoded.trim().startsWith("{")) return decoded;
  }
  throw new Error("Unrecognised typedDataToSign format");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function WalletExecutor({ wallet, address, decision, receipt }: { wallet: InjectedWallet; address: string; decision: RouteDecision; receipt: string | null }) {
  const best = decision.best;
  const [steps, setSteps] = useState<Record<StepId, StepState>>({ network: "idle", build: "idle", allowance: "idle", sign: "idle", settle: "idle" });
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<{ hash?: string; orderId?: string; received?: string } | null>(null);
  const [ignoreSimulation, setIgnoreSimulation] = useState(false);

  if (!best) return null;
  const side = decision.order.side;
  const amount = side === "buy" ? decision.order.amountUsd : decision.order.tokens;
  const receiveToken = (side === "buy" ? best.version.address : TOKENS.USDT.address) as Address;
  const receiveDecimals = side === "buy" ? best.version.decimals : TOKENS.USDT.decimals;
  const mark = (id: StepId, state: StepState) => setSteps((s) => ({ ...s, [id]: state }));

  async function run() {
    setRunning(true);
    setError(null);
    setDone(null);
    let current: StepId = "network";
    try {
      const account = address as Address;
      const walletClient = createWalletClient({ account, chain: bsc, transport: custom(wallet.provider) });
      const publicClient = createPublicClient({ chain: bsc, transport: http(process.env.NEXT_PUBLIC_BSC_RPC_URL || undefined) });
      const balance = (block?: bigint) =>
        publicClient.readContract({ address: receiveToken, abi: erc20Abi, functionName: "balanceOf", args: [account], blockNumber: block });

      mark("network", "active");
      if ((await walletClient.getChainId()) !== bsc.id) await walletClient.switchChain({ id: bsc.id });
      mark("network", "done");

      current = "build";
      mark("build", "active");
      const build = () => post<BuiltExecution>("/api/execute/build", { address: best!.version.address, side, amount, wallet: account });
      let built = await build();
      setNote(`${built.route.vendor} · ${built.executionMode}`);
      mark("build", "done");

      current = "allowance";
      mark("allowance", "active");
      const spender = (built.route.approveTarget ?? built.tx?.to) as Address | undefined;
      if (!spender) throw new Error("The Trading API returned no spender for this route");
      const allowance = await publicClient.readContract({ address: built.fromToken, abi: erc20Abi, functionName: "allowance", args: [account, spender] });
      if (allowance < BigInt(built.amountIn)) {
        const approve = await post<{ to: Address; data: Hex; spender: string; gasLimit: string }>("/api/execute/approve", {
          token: built.fromToken,
          amount: built.amountIn,
          vendor: built.route.mode === "RFQ" ? built.route.vendor : undefined,
        });
        const hash = await walletClient.sendTransaction({ to: approve.to, data: approve.data, gas: BigInt(approve.gasLimit) });
        setNote(`Approval sent · ${hash.slice(0, 10)}…`);
        const r = await publicClient.waitForTransactionReceipt({ hash });
        if (r.status !== "success") throw new Error("Approval transaction reverted");
        // The first quote may have expired (30 s TTL) while the approval confirmed.
        built = await build();
        mark("allowance", "done");
      } else {
        mark("allowance", "skipped");
      }

      const before = await balance();
      current = "sign";
      mark("sign", "active");
      if (built.executionMode === "SWAP") {
        const tx = built.tx;
        if (!tx) throw new Error("No transaction returned for a SWAP route");
        if (built.simulation && !built.simulation.ok && !ignoreSimulation) {
          throw new Error(`Simulation did not pass: ${built.simulation.failReason ?? built.simulation.error ?? built.simulation.status}. Tick “send anyway” to override.`);
        }
        const fees = tx.maxPriorityFeePerGas
          ? { maxFeePerGas: BigInt(tx.gasPrice), maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas) }
          : { gasPrice: BigInt(tx.gasPrice) };
        const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data, value: BigInt(tx.value || "0"), gas: BigInt(tx.gas), ...fees });
        mark("sign", "done");
        current = "settle";
        mark("settle", "active");
        const r = await publicClient.waitForTransactionReceipt({ hash });
        if (r.status !== "success") throw new Error("Swap transaction reverted");
        const after = await balance(r.blockNumber);
        setDone({ hash, received: fromBaseUnits(after - before, receiveDecimals) });
        mark("settle", "done");
      } else {
        const rfq = built.rfq;
        if (!rfq?.orderId) throw new Error("No RFQ order returned");
        const signature = (await wallet.provider.request({
          method: "eth_signTypedData_v4",
          params: [account, typedDataJson(rfq.typedDataToSign)],
        })) as string;
        mark("sign", "done");
        current = "settle";
        mark("settle", "active");
        let order = await post<{ orderId: string; status: string }>("/api/execute/rfq", {
          signature,
          vendor: rfq.vendor,
          quoteId: rfq.orderId,
          signingScheme: rfq.signingScheme,
          requestId: crypto.randomUUID(),
        });
        let status: { orderId: string; status: string; txHash?: string; toAmount?: string } = order;
        const deadline = Date.now() + 180_000;
        while (!TERMINAL.has(status.status) && Date.now() < deadline) {
          await sleep(2_000);
          const res = await fetch(`/api/execute/status?orderId=${encodeURIComponent(order.orderId)}`);
          const json = (await res.json()) as { order?: typeof status; error?: string };
          if (json.order) status = json.order;
          setNote(`RFQ ${status.status}`);
        }
        if (status.status !== "FILLED") throw new Error(`RFQ order ended as ${status.status}`);
        order = status;
        setDone({ hash: status.txHash, orderId: order.orderId, received: status.toAmount ? fromBaseUnits(status.toAmount, receiveDecimals) : undefined });
        mark("settle", "done");
      }
    } catch (e) {
      mark(current, "error");
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const receiptHref =
    receipt && done
      ? `/receipt?d=${receipt}${done.hash ? `&tx=${done.hash}` : ""}${done.orderId ? `&order=${done.orderId}` : ""}${done.received ? `&out=${done.received}` : ""}`
      : null;

  return (
    <div className="space-y-4">
      <ol className="space-y-2">
        {STEPS.map((step) => {
          const state = steps[step.id];
          return (
            <li key={step.id} className="flex items-center gap-3 text-sm">
              <span
                className={clsx(
                  "grid size-6 place-items-center rounded-full border",
                  state === "done" && "border-gold/60 bg-gold/10 text-gold",
                  state === "active" && "border-gold/50 text-gold",
                  state === "error" && "border-danger/50 bg-danger/10 text-danger",
                  (state === "idle" || state === "skipped") && "border-line text-fg-muted",
                )}
              >
                {state === "done" ? <Check className="size-3.5" /> : state === "active" ? <Loader2 className="size-3.5 animate-spin" /> : state === "error" ? <X className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className={clsx(state === "idle" ? "text-fg-muted" : "text-fg", state === "skipped" && "line-through decoration-fg-faint")}>{step.label}</span>
            </li>
          );
        })}
      </ol>

      {note ? <p className="num text-xs text-fg-muted">{note}</p> : null}
      {error ? <p className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs leading-relaxed text-danger">{error}</p> : null}

      <label className="flex items-center gap-2 text-xs text-fg-muted">
        <input type="checkbox" checked={ignoreSimulation} onChange={(e) => setIgnoreSimulation(e.target.checked)} className="accent-gold" />
        Send anyway if the Transaction API simulation does not pass
      </label>

      {done ? (
        <div className="rounded-xl border border-gold/40 bg-ink-800 p-4 text-sm">
          <p className="font-medium text-gold">Filled{done.received ? ` · received ${done.received} ${side === "buy" ? best.version.symbol : "USDT"}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {done.hash ? (
              <a className="text-fg-muted underline hover:text-fg" href={BSCTRACE_TX(done.hash)} target="_blank" rel="noreferrer">
                View on BscTrace
              </a>
            ) : null}
            {receiptHref ? (
              <Link className="font-medium text-gold hover:text-gold-bright" href={receiptHref}>
                Open execution receipt →
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={running}
          onClick={run}
          className="w-full rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-gold-bright disabled:cursor-wait disabled:opacity-60"
        >
          {running ? "Working…" : `${side === "buy" ? "Buy" : "Sell"} with ${wallet.name}`}
        </button>
      )}
      <p className="text-[11px] leading-relaxed text-fg-muted">
        Small amounts only. Nothing is signed without your wallet&apos;s confirmation; FairFill never sees a private key.
      </p>
    </div>
  );
}

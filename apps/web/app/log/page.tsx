import { summarize } from "@fairfill/core";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SectionHeading } from "@/components/primitives";
import { getEngine } from "@/lib/server";

export const metadata: Metadata = { title: "Builder log" };

export default async function LogPage() {
  await connection();
  const entries = await getEngine().journal.all();
  const stats = summarize(entries);
  const errors = entries.filter((e) => !e.ok).slice(-30).reverse();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-14 sm:px-6">
      <SectionHeading eyebrow="Builder log" title={<>Every call, <span className="text-gold">measured</span>.</>}>
        FairFill records latency and the exact code and message of every Binance Web3 API call. These are the raw numbers behind our
        Developer Experience report — no impressions.
      </SectionHeading>

      <div className="panel mt-10 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-[0.14em] text-fg-muted">
              <th className="px-4 py-3 font-medium">Endpoint</th>
              <th className="px-4 py-3 text-right font-medium">Calls</th>
              <th className="px-4 py-3 text-right font-medium">Errors</th>
              <th className="px-4 py-3 text-right font-medium">p50</th>
              <th className="px-4 py-3 text-right font-medium">p95</th>
              <th className="px-4 py-3 font-medium">Last error</th>
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-fg-muted">
                  No calls recorded yet. Open a stock page or run <span className="num">pnpm smoke</span>.
                </td>
              </tr>
            ) : (
              stats.map((s) => (
                <tr key={s.endpoint} className="border-b border-line/70 last:border-0">
                  <td className="num break-all px-4 py-3 text-xs text-fg">{s.endpoint}</td>
                  <td className="num px-4 py-3 text-right">{s.calls}</td>
                  <td className={`num px-4 py-3 text-right ${s.errors ? "text-danger" : "text-fg-muted"}`}>{s.errors}</td>
                  <td className="num whitespace-nowrap px-4 py-3 text-right">{s.p50} ms</td>
                  <td className={`num whitespace-nowrap px-4 py-3 text-right ${s.p95 > 1500 ? "text-gold" : ""}`}>{s.p95} ms</td>
                  <td className="num px-4 py-3 text-xs text-fg-muted">{s.lastError ? `${s.lastError.code ?? "—"} · ${s.lastError.message ?? ""}`.slice(0, 90) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-14 text-lg font-semibold tracking-tight">Recent errors, verbatim</h2>
      <ul className="mt-4 space-y-2">
        {errors.length === 0 ? <li className="text-sm text-fg-muted">None so far.</li> : null}
        {errors.map((e) => (
          <li key={`${e.ts}-${e.endpoint}`} className="rounded-xl border border-line bg-ink-850/70 p-3 text-xs">
            <div className="num flex flex-wrap justify-between gap-2 text-fg-muted">
              <span>
                {e.method} {e.endpoint}
              </span>
              <span>
                {new Date(e.ts).toISOString()} · HTTP {e.httpStatus ?? "—"} · {e.ms} ms
              </span>
            </div>
            <p className="num mt-1.5 text-danger">
              {e.code ?? "no code"} — {e.message ?? "no message"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

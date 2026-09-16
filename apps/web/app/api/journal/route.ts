import { summarize } from "@fairfill/core";
import { getEngine } from "@/lib/server";

/** Latency and error statistics per endpoint, for the Developer Experience report. */
export async function GET() {
  const entries = await getEngine().journal.all();
  const errors = entries.filter((e) => !e.ok).slice(-50).reverse();
  return Response.json({ total: entries.length, endpoints: summarize(entries), recentErrors: errors });
}

import type { HistoryRange } from "@fairfill/core";
import { errorResponse, getEngine } from "@/lib/server";

const RANGES = new Set<HistoryRange>(["1d", "1w", "1m"]);

export async function GET(request: Request, ctx: RouteContext<"/api/history/[ticker]">) {
  const { ticker } = await ctx.params;
  const range = new URL(request.url).searchParams.get("range") ?? "1d";
  if (!RANGES.has(range as HistoryRange)) return Response.json({ error: "range must be 1d, 1w or 1m" }, { status: 400 });
  try {
    const history = await getEngine().history(ticker, range as HistoryRange);
    if (!history) return Response.json({ error: `Unknown ticker ${ticker}` }, { status: 404 });
    return Response.json(history);
  } catch (error) {
    return errorResponse(error);
  }
}

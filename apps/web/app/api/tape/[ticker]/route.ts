import { errorResponse, getEngine } from "@/lib/server";

export async function GET(_request: Request, ctx: RouteContext<"/api/tape/[ticker]">) {
  const { ticker } = await ctx.params;
  try {
    const tape = await getEngine().tape(ticker);
    if (!tape) return Response.json({ error: `Unknown ticker ${ticker}` }, { status: 404 });
    return Response.json(tape);
  } catch (error) {
    return errorResponse(error);
  }
}

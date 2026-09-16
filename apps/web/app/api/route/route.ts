import { encodeReceipt } from "@fairfill/core";
import { parseOrder } from "@/lib/orders";
import { errorResponse, getEngine, rateLimited } from "@/lib/server";

/** Free best-execution route for people using the web app. Agents use /api/x402/route. */
export async function POST(request: Request) {
  const limited = rateLimited(request, "route", 30);
  if (limited) return limited;
  try {
    const order = parseOrder((await request.json()) as Record<string, unknown>);
    const engine = getEngine();
    const decision = await engine.route(order);
    const snapshot = engine.receiptFor(decision);
    return Response.json({ decision, receipt: snapshot ? encodeReceipt(snapshot) : null });
  } catch (error) {
    return errorResponse(error);
  }
}

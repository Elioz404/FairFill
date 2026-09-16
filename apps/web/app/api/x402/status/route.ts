import { errorResponse, getEngine } from "@/lib/server";
import { getGate } from "@/lib/x402";

/** Shows what the paid endpoint would ask for, so B402 onboarding can be checked without paying. */
export async function GET() {
  const engine = getEngine();
  if (engine.mode !== "live") {
    return Response.json({ enabled: false, reason: "Binance Web3 API keys are not configured" });
  }
  if (!engine.config.x402.payTo) {
    return Response.json({ enabled: false, reason: "FAIRFILL_X402_PAY_TO is not set (complete B402 onboarding first)" });
  }
  try {
    const required = await getGate().paymentRequired(`${engine.config.baseUrl}/api/x402/route`);
    return Response.json({ enabled: true, paymentRequired: required });
  } catch (error) {
    return errorResponse(error);
  }
}

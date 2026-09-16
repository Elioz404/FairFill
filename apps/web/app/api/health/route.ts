import { getEngine } from "@/lib/server";

export async function GET() {
  const engine = getEngine();
  return Response.json({
    ok: true,
    mode: engine.mode,
    rfqQuoteWallet: Boolean(engine.config.quoteWallet),
    x402: Boolean(engine.config.x402.payTo) && engine.mode === "live",
  });
}

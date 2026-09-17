import { getEngine } from "@/lib/server";

export async function GET() {
  const engine = getEngine();
  await engine.probe();
  const issue = engine.apiKeyIssue;
  return Response.json({
    ok: true,
    mode: engine.mode,
    keysConfigured: engine.keysConfigured,
    // Binance Web3 API blocks some server locations; this is where the request actually ran.
    region: process.env.VERCEL_REGION ?? null,
    keyIssue: issue ? { code: issue.code, message: issue.message } : null,
    rfqQuoteWallet: Boolean(engine.config.quoteWallet),
    feePercent: engine.config.fee ? Number(engine.config.fee.percent) : null,
    x402: Boolean(engine.config.x402.payTo) && engine.mode === "live",
  });
}

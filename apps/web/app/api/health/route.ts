import { getEngine } from "@/lib/server";

export async function GET() {
  const engine = getEngine();
  await engine.probe();
  const issue = engine.apiKeyIssue;
  return Response.json({
    ok: true,
    mode: engine.mode,
    keysConfigured: engine.keysConfigured,
    keyIssue: issue ? { code: issue.code, message: issue.message } : null,
    rfqQuoteWallet: Boolean(engine.config.quoteWallet),
    x402: Boolean(engine.config.x402.payTo) && engine.mode === "live",
  });
}

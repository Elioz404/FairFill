import { encodeReceipt } from "@fairfill/core";
import { parseOrder } from "@/lib/orders";
import { errorResponse, getEngine, rateLimited } from "@/lib/server";
import { getGate } from "@/lib/x402";

/**
 * Paid best-execution route for AI agents (x402 v2, settled by B402 on BSC).
 * GET /api/x402/route?ticker=AAPL&side=buy&amountUsd=20&wallet=0x…
 */
export async function GET(request: Request) {
  const limited = rateLimited(request, "x402", 60);
  if (limited) return limited;
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    // Validate before asking for money.
    const order = parseOrder(params);
    const engine = getEngine();
    const resourceUrl = `${engine.config.baseUrl}${url.pathname}${url.search}`;
    return await getGate().handle(request, resourceUrl, async () => {
      const decision = await engine.route(order);
      const snapshot = engine.receiptFor(decision);
      const best = decision.best;
      return {
        ticker: decision.listing.ticker,
        side: decision.order.side,
        mode: decision.mode,
        best: best
          ? {
              issuer: best.version.issuer,
              symbol: best.version.symbol,
              tokenAddress: best.version.address,
              chainId: best.version.chainId,
              costBps: best.costBps,
              shares: best.shares,
              executionMode: best.quote && best.quote.ok ? best.quote.best.mode : null,
              vendor: best.quote && best.quote.ok ? best.quote.best.vendor : null,
              // Integrator fee already included in costBps; null when none applies (RFQ routes never carry one).
              feeUsd: best.quote && best.quote.ok ? best.quote.best.feeUsd : null,
            }
          : null,
        benchmark: decision.benchmark,
        fee: decision.fee,
        explanation: decision.explanation,
        warnings: decision.warnings,
        receiptUrl: snapshot ? `${engine.config.baseUrl}/receipt?d=${encodeReceipt(snapshot)}` : null,
        decidedAt: decision.createdAt,
      };
    });
  } catch (error) {
    return errorResponse(error);
  }
}

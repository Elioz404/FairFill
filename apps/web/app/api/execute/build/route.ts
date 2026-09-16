import { errorResponse, getEngine, isAddress, positiveNumber, rateLimited } from "@/lib/server";

/**
 * Fresh quote → unsigned swap tx (SWAP, simulated through the Transaction API)
 * or EIP-712 order (RFQ). The browser wallet signs; nothing is signed here.
 */
export async function POST(request: Request) {
  const limited = rateLimited(request, "build", 20);
  if (limited) return limited;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const side = body.side === "sell" ? "sell" : "buy";
    const amount = positiveNumber(body.amount);
    if (!isAddress(body.address)) throw new Error("address (stock token) is required");
    if (!isAddress(body.wallet)) throw new Error("wallet is required");
    if (amount === null) throw new Error("amount must be positive");
    const slippage = typeof body.slippagePercent === "string" && /^\d+(\.\d+)?$/.test(body.slippagePercent) ? body.slippagePercent : undefined;
    const built = await getEngine().buildExecution({ address: body.address, side, amount, wallet: body.wallet, slippagePercent: slippage });
    return Response.json(built);
  } catch (error) {
    return errorResponse(error);
  }
}

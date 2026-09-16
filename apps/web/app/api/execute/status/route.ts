import { errorResponse, getEngine } from "@/lib/server";

/** RFQ order status (?orderId=) or on-chain transaction detail (?txHash=). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const orderId = params.get("orderId");
  const txHash = params.get("txHash");
  try {
    const engine = getEngine();
    if (orderId) return Response.json({ kind: "rfq", order: await engine.rfqOrder(orderId) });
    if (txHash && /^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      const details = await engine.txDetail(txHash);
      // An empty list right after broadcast means "not indexed yet" (docs), not "not found".
      return Response.json({ kind: "tx", indexed: details.length > 0, detail: details[0] ?? null });
    }
    throw new Error("orderId or a valid txHash is required");
  } catch (error) {
    return errorResponse(error);
  }
}

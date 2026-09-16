import { errorResponse, getEngine } from "@/lib/server";

const VENDORS = new Set(["InchFusion", "CowSwap", "PcsXRfq"]);

/** Submit a signed RFQ order (Ondo and bStocks RFQ routes). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(body.signature)) throw new Error("signature must be a 65-byte hex string");
    if (typeof body.vendor !== "string" || !VENDORS.has(body.vendor)) throw new Error("unknown RFQ vendor");
    if (typeof body.quoteId !== "string" || !body.quoteId) throw new Error("quoteId (rfq.orderId from /swap) is required");
    if (typeof body.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.requestId)) throw new Error("requestId must be a UUID");
    const order = await getEngine().submitRfq({
      signature: body.signature,
      vendor: body.vendor,
      quoteId: body.quoteId,
      signingScheme: typeof body.signingScheme === "string" ? body.signingScheme : undefined,
      requestId: body.requestId,
    });
    return Response.json(order);
  } catch (error) {
    return errorResponse(error);
  }
}

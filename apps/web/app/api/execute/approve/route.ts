import { errorResponse, getEngine, isAddress } from "@/lib/server";

/** ERC-20 approve() calldata from the Trading API. `vendor` is required for RFQ routes. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (!isAddress(body.token)) throw new Error("token is required");
    if (typeof body.amount !== "string" || !/^\d+$/.test(body.amount)) throw new Error("amount must be an integer string in base units");
    const vendor = typeof body.vendor === "string" && body.vendor ? body.vendor : undefined;
    return Response.json(await getEngine().approveCalldata({ token: body.token, amount: body.amount, vendor }));
  } catch (error) {
    return errorResponse(error);
  }
}

import { errorResponse, getEngine } from "@/lib/server";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const results = await getEngine().search(q, 8);
    return Response.json({
      results: results.map((l) => ({
        ticker: l.ticker,
        name: l.name,
        logoUrl: l.logoUrl ?? null,
        issuers: l.versions.map((v) => v.issuer),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

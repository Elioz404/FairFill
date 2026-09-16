import { getEngine } from "@/lib/server";

export async function GET() {
  return Response.json(await getEngine().marketSession());
}

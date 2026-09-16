import { loadBoard } from "@/lib/board";
import { errorResponse, getEngine } from "@/lib/server";

export async function GET() {
  try {
    const [rows, session] = await Promise.all([loadBoard(), getEngine().marketSession()]);
    return Response.json({ rows, session, fetchedAt: Date.now() });
  } catch (error) {
    return errorResponse(error);
  }
}

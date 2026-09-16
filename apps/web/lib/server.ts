import { NotConfiguredError, Web3ApiError, getEngine } from "@fairfill/core";

export { getEngine };

/** Uniform JSON errors: the exact upstream code and message are kept (they feed the DX report too). */
export function errorResponse(error: unknown): Response {
  if (error instanceof NotConfiguredError) {
    return Response.json({ error: error.message, code: "NOT_CONFIGURED" }, { status: 503 });
  }
  if (error instanceof Web3ApiError) {
    return Response.json(
      { error: error.apiMessage, code: error.code, endpoint: error.endpoint },
      { status: error.httpStatus && error.httpStatus >= 400 ? error.httpStatus : 502 },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ error: message }, { status: 400 });
}

const buckets = new Map<string, { count: number; reset: number }>();

/**
 * The Web3 API allows 5 requests per second per endpoint, so public routes that fan out
 * into quotes are throttled per client.
 */
export function rateLimited(request: Request, key: string, limit: number, windowMs = 60_000): Response | null {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const id = `${key}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(id);
  if (!bucket || bucket.reset < now) {
    buckets.set(id, { count: 1, reset: now + windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count <= limit) return null;
  const retryAfter = Math.ceil((bucket.reset - now) / 1000);
  return Response.json({ error: "Too many requests, slow down." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}

export const isAddress = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);

export function positiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

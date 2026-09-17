import type { Journal } from "../journal";
import { signRequest, type QueryValue } from "./sign";

export class Web3ApiError extends Error {
  constructor(
    readonly endpoint: string,
    readonly code: number | string | null,
    readonly apiMessage: string,
    readonly httpStatus: number | null,
  ) {
    super(`${endpoint} → ${code ?? httpStatus ?? "error"}: ${apiMessage}`);
    this.name = "Web3ApiError";
  }
}

interface Envelope<T> {
  code?: number | string;
  msg?: string;
  message?: string;
  data?: T;
  success?: boolean;
}

// Market/Trading/Transaction/Wallet/DeFi return code 0; B402 returns "000000000".
function isSuccess(env: Envelope<unknown>): boolean {
  if (env.code === 0 || env.code === "0" || env.code === "000000000") return true;
  return env.code === undefined && env.success === true;
}

/** Gateway answers that mean the keys themselves are unusable, not just one call. */
const KEY_FAILURES = new Set(["40101", "40102", "40103", "40302"]);

export interface KeyIssue {
  code: number | string | null;
  message: string;
  httpStatus: number | null;
}

export interface ClientOptions {
  apiKey: string;
  secretKey: string;
  journal?: Journal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Called with the failure when the gateway rejects the keys, and with null after any successful call. */
  onKeyStatus?: (issue: KeyIssue | null) => void;
}

export interface CallOptions {
  /** Safe to retry on 429 / 5xx. Never set for broadcast or settle. */
  idempotent?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Web3ApiClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get<T>(path: string, query: Record<string, QueryValue> = {}, call: CallOptions = { idempotent: true }): Promise<T> {
    return this.request<T>("GET", path, query, undefined, call);
  }

  post<T>(path: string, body: unknown, call: CallOptions = {}): Promise<T> {
    return this.request<T>("POST", path, undefined, JSON.stringify(body), call);
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    query: Record<string, QueryValue> | undefined,
    body: string | undefined,
    call: CallOptions,
  ): Promise<T> {
    const attempts = call.idempotent ? 3 : 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      // Re-sign every attempt: the timestamp and anti-replay nonce must be fresh.
      const signed = signRequest({ apiKey: this.opts.apiKey, secretKey: this.opts.secretKey, method, path, query, body });
      const started = Date.now();
      let httpStatus: number | null = null;
      try {
        const res = await this.fetchImpl(signed.url, {
          method,
          headers: signed.headers,
          body: signed.body,
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15_000),
        });
        httpStatus = res.status;
        const text = await res.text();
        let env: Envelope<T>;
        try {
          env = text ? (JSON.parse(text) as Envelope<T>) : {};
        } catch {
          const message = `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 120)}`;
          this.log(method, path, started, httpStatus, null, message, false);
          throw new Web3ApiError(path, null, message, res.status);
        }
        if (res.ok && isSuccess(env)) {
          this.log(method, path, started, httpStatus, env.code ?? 0, null, true);
          return env.data as T;
        }
        const message = env.msg ?? env.message ?? `HTTP ${res.status}`;
        this.log(method, path, started, httpStatus, env.code ?? null, message, false);
        const error = new Web3ApiError(path, env.code ?? null, message, res.status);
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt === attempts) throw error;
        lastError = error;
        const retryAfter = Number(res.headers.get("Retry-After"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 3_000) : 400 * attempt);
      } catch (error) {
        if (error instanceof Web3ApiError) {
          if (attempt === attempts || (error.httpStatus !== null && error.httpStatus < 500 && error.httpStatus !== 429)) throw error;
          lastError = error;
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.log(method, path, started, httpStatus, null, message, false);
        lastError = new Web3ApiError(path, null, message, httpStatus);
        if (attempt === attempts) throw lastError;
        await sleep(400 * attempt);
      }
    }
    throw lastError;
  }

  private log(method: string, endpoint: string, started: number, httpStatus: number | null, code: number | string | null, message: string | null, ok: boolean) {
    this.opts.journal?.record({ ts: started, method, endpoint, httpStatus, code, message, ok, ms: Date.now() - started });
    if (ok) this.opts.onKeyStatus?.(null);
    else if (code !== null && KEY_FAILURES.has(String(code))) this.opts.onKeyStatus?.({ code, message: message ?? "", httpStatus });
  }
}

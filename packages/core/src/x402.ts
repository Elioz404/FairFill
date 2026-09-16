import { TtlCache } from "./cache";
import type { EngineConfig } from "./config";
import { BSC_CAIP2 } from "./shared/constants";
import { toBaseUnits } from "./shared/units";
import type { B402Kind, B402SettleResult, Web3Api } from "./web3api/endpoints";

/**
 * x402 v2 merchant gate settled by B402 (Binance's facilitator).
 * Flow (docs: B402 → Integration Guide): 402 + PAYMENT-REQUIRED → buyer replays
 * with PAYMENT-SIGNATURE → verify → do the work → settle → 200 + PAYMENT-RESPONSE.
 * Buyers such as the Binance Agentic Wallet (`baw x402-payment preview/sign`) speak this protocol.
 */

export interface PaymentRequirement {
  scheme: "exact";
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

export interface PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: { url: string; description: string; mimeType: string };
  accepts: PaymentRequirement[];
}

export const encodeHeader = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");

export function decodeHeader<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as T;
  } catch {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
}

/** Order-insensitive deep equality for JSON values. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return typeof a === "string" && typeof b === "string" ? a.toLowerCase() === b.toLowerCase() && /^0x/i.test(a) : false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

async function erc20Name(rpcUrl: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: token, data: "0x06fdde03" }, "latest"] }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await res.json()) as { result?: string };
    const hex = body.result?.slice(2) ?? "";
    if (hex.length < 192) return null;
    const length = parseInt(hex.slice(64, 128), 16);
    return Buffer.from(hex.slice(128, 128 + length * 2), "hex").toString("utf8");
  } catch {
    return null;
  }
}

export class X402Gate {
  private readonly kindCache = new TtlCache<B402Kind>(10 * 60_000);

  constructor(
    private readonly api: Web3Api,
    private readonly config: EngineConfig["x402"],
    private readonly rpcUrl = "https://bsc-dataseed.bnbchain.org",
  ) {}

  get enabled(): boolean {
    return Boolean(this.config.payTo);
  }

  /**
   * B402 `kinds[]` carry the EIP-712 domain (name/version) but not the asset address,
   * so the kind is matched against the configured token's on-chain name().
   */
  private kind(): Promise<B402Kind> {
    return this.kindCache.get("kind", async () => {
      const supported = await this.api.b402Supported();
      const candidates = (supported?.kinds ?? []).filter(
        (k) => k.x402Version === 2 && k.scheme === "exact" && k.network === BSC_CAIP2 && k.extra?.assetTransferMethod === "eip3009",
      );
      const byAsset = candidates.find((k) => {
        const asset = (k.extra.asset ?? k.extra.assetAddress) as string | undefined;
        return typeof asset === "string" && asset.toLowerCase() === this.config.asset.toLowerCase();
      });
      if (byAsset) return byAsset;
      const name = await erc20Name(this.rpcUrl, this.config.asset);
      const byName = candidates.find((k) => name !== null && k.extra.name === name);
      if (byName) return byName;
      if (candidates.length === 1) return candidates[0] as B402Kind;
      throw new Error(
        `No B402 kind matches asset ${this.config.asset} (on-chain name: ${name ?? "unknown"}). Offered: ${candidates.map((k) => k.extra.name).join(", ") || "none"}`,
      );
    });
  }

  async paymentRequired(resourceUrl: string, error?: string): Promise<PaymentRequired> {
    const kind = await this.kind();
    return {
      x402Version: 2,
      ...(error ? { error } : {}),
      resource: {
        url: resourceUrl,
        description: "FairFill best-execution route for a tokenized stock order on BNB Chain",
        mimeType: "application/json",
      },
      accepts: [
        {
          scheme: "exact",
          network: BSC_CAIP2,
          // U and USD1 are 18-decimal dollar stablecoins (docs: B402 production assets).
          amount: toBaseUnits(this.config.priceUsd, 18),
          asset: this.config.asset,
          payTo: this.config.payTo as string,
          maxTimeoutSeconds: 300,
          extra: { ...kind.extra },
        },
      ],
    };
  }

  /**
   * Runs `work` only for a verified payment and settles before returning its result.
   * Returns a Web `Response` so it can be used directly from route handlers.
   */
  async handle(request: Request, resourceUrl: string, work: () => Promise<unknown>): Promise<Response> {
    if (!this.enabled) {
      return Response.json({ error: "x402 endpoint disabled: set FAIRFILL_X402_PAY_TO after B402 onboarding" }, { status: 503 });
    }
    const challenge = async (error?: string) => {
      const required = await this.paymentRequired(resourceUrl, error);
      return Response.json(required, { status: 402, headers: { "PAYMENT-REQUIRED": encodeHeader(required) } });
    };

    const header = request.headers.get("PAYMENT-SIGNATURE");
    if (!header) return challenge();

    const payload = decodeHeader<{ x402Version?: number; accepted?: unknown; payload?: unknown; resource?: unknown; extensions?: Record<string, unknown> }>(header);
    if (!payload || payload.x402Version !== 2) return challenge("invalid_x402_version");

    const requirement = (await this.paymentRequired(resourceUrl)).accepts[0] as PaymentRequirement;
    // Never let the buyer change amount, asset, network, payTo, timeout or extra.
    if (!sameJson(payload.accepted, requirement)) return challenge("invalid_payment_requirements");

    const body = { x402Version: 2, paymentPayload: payload, paymentRequirements: requirement };
    const verify = await this.api.b402Verify(body);
    if (!verify.isValid) return challenge(verify.invalidReason ?? "invalid_payload");

    let result: unknown;
    try {
      result = await work();
    } catch (error) {
      // Nothing has been charged yet: the authorization was only verified.
      return Response.json({ error: error instanceof Error ? error.message : String(error), charged: false }, { status: 422 });
    }

    const settleBody = {
      ...body,
      paymentPayload: { ...payload, extensions: { ...(payload.extensions ?? {}), bazaar: BAZAAR_LISTING } },
    };
    let settle: B402SettleResult;
    try {
      settle = await this.api.b402Settle(settleBody);
    } catch (error) {
      return Response.json({ error: `settlement failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
    }
    if (!settle.success) {
      if (settle.transaction) {
        // Broadcast but unconfirmed: never ask the buyer for a fresh authorization.
        return Response.json({ error: "settlement pending reconciliation", transaction: settle.transaction }, { status: 502 });
      }
      return challenge(settle.errorReason ?? "unexpected_settle_error");
    }
    return Response.json(result, { status: 200, headers: { "PAYMENT-RESPONSE": encodeHeader(settle) } });
  }
}

/** B402 Bazaar discovery metadata (optional V2 settle extension). */
const BAZAAR_LISTING = {
  description: "Best-execution route across bStocks, Ondo and xStocks versions of a US stock on BNB Chain",
  routeTemplate: "/api/x402/route",
  info: {
    input: {
      type: "http",
      method: "GET",
      queryParams: { ticker: "AAPL", side: "buy", amountUsd: "20", wallet: "0x..." },
    },
  },
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      input: {
        type: "object",
        properties: { type: { const: "http" }, method: { enum: ["GET"] } },
        required: ["type", "method"],
      },
    },
    required: ["input"],
  },
};

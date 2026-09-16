import { describe, expect, it, vi } from "vitest";
import { X402Gate, decodeHeader, encodeHeader, sameJson } from "../src/x402";
import { decodeReceipt, encodeReceipt, realisedCostBps, type ReceiptSnapshot } from "../src/shared/receipt";
import type { Web3Api } from "../src/web3api/endpoints";

const PAY_TO = "0x2222222222222222222222222222222222222222";
const U = "0xcE24439F2D9C6a2289F741120FE202248B666666";
const kind = { x402Version: 2, scheme: "exact", network: "eip155:56", extra: { name: "U", version: "1", assetTransferMethod: "eip3009", signerAddress: "0x3333333333333333333333333333333333333333" } };

function fakeApi(overrides: Partial<Web3Api> = {}): Web3Api {
  return {
    b402Supported: vi.fn(async () => ({ kinds: [kind] })),
    b402Verify: vi.fn(async () => ({ isValid: true })),
    b402Settle: vi.fn(async () => ({ success: true, transaction: "0xabc", payer: "0x5555", network: "eip155:56", amount: "10000000000000000" })),
    ...overrides,
  } as unknown as Web3Api;
}

const gate = (api: Web3Api) => new X402Gate(api, { payTo: PAY_TO, priceUsd: "0.01", asset: U }, "http://127.0.0.1:1");

describe("x402 gate", () => {
  it("challenges unpaid requests with a v2 PAYMENT-REQUIRED header", async () => {
    const res = await gate(fakeApi()).handle(new Request("http://x/api"), "http://x/api", async () => ({ ok: true }));
    expect(res.status).toBe(402);
    const header = decodeHeader<{ x402Version: number; accepts: { amount: string; payTo: string; extra: { assetTransferMethod: string } }[] }>(
      res.headers.get("PAYMENT-REQUIRED")!,
    );
    expect(header?.x402Version).toBe(2);
    expect(header?.accepts[0]?.amount).toBe("10000000000000000");
    expect(header?.accepts[0]?.payTo).toBe(PAY_TO);
    expect(header?.accepts[0]?.extra.assetTransferMethod).toBe("eip3009");
  });

  it("verifies, runs the work, settles and returns PAYMENT-RESPONSE", async () => {
    const api = fakeApi();
    const g = gate(api);
    const required = await g.paymentRequired("http://x/api");
    const payment = { x402Version: 2, accepted: required.accepts[0], payload: { signature: "0x01" } };
    const res = await g.handle(
      new Request("http://x/api", { headers: { "PAYMENT-SIGNATURE": encodeHeader(payment) } }),
      "http://x/api",
      async () => ({ route: "AAPLB" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ route: "AAPLB" });
    expect(decodeHeader<{ transaction: string }>(res.headers.get("PAYMENT-RESPONSE")!)?.transaction).toBe("0xabc");
    expect(api.b402Verify).toHaveBeenCalledOnce();
    expect(api.b402Settle).toHaveBeenCalledOnce();
  });

  it("refuses a payload whose accepted terms were tampered with", async () => {
    const api = fakeApi();
    const g = gate(api);
    const required = await g.paymentRequired("http://x/api");
    const tampered = { x402Version: 2, accepted: { ...required.accepts[0], amount: "1" }, payload: {} };
    const res = await g.handle(new Request("http://x/api", { headers: { "PAYMENT-SIGNATURE": encodeHeader(tampered) } }), "http://x/api", async () => 1);
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("invalid_payment_requirements");
    expect(api.b402Verify).not.toHaveBeenCalled();
  });

  it("does not settle when the work fails", async () => {
    const api = fakeApi();
    const g = gate(api);
    const required = await g.paymentRequired("http://x/api");
    const payment = { x402Version: 2, accepted: required.accepts[0], payload: {} };
    const res = await g.handle(new Request("http://x/api", { headers: { "PAYMENT-SIGNATURE": encodeHeader(payment) } }), "http://x/api", async () => {
      throw new Error("unknown ticker");
    });
    expect(res.status).toBe(422);
    expect(api.b402Settle).not.toHaveBeenCalled();
  });

  it("compares addresses case-insensitively and ignores key order", () => {
    expect(sameJson({ a: "0xABC", b: 1 }, { b: 1, a: "0xabc" })).toBe(true);
    expect(sameJson({ a: "Hello" }, { a: "hello" })).toBe(false);
  });
});

describe("receipts", () => {
  const snap: ReceiptSnapshot = {
    v: 1,
    ticker: "AAPL",
    side: "buy",
    issuer: "bstocks",
    symbol: "AAPLB",
    address: "0x431a3bee82e2ca41e49895cbece5bb0f76a89b7a",
    decimals: 18,
    shareRatio: 1,
    amountUsd: 20,
    tokens: null,
    expectedShares: 0.0598,
    expectedCostBps: 9,
    benchmarkUsd: 333.98,
    benchmarkSource: "us-market",
    alternatives: [{ symbol: "AAPLx", issuer: "xstocks", costBps: null, excluded: "stale — ünïcödé ok" }],
    decidedAt: 1_789_000_000_000,
  };

  it("round-trips through a URL-safe string", () => {
    const encoded = encodeReceipt(snap);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeReceipt(encoded)).toEqual(snap);
    expect(decodeReceipt("garbage")).toBeNull();
  });

  it("measures the realised cost of a fill", () => {
    const bps = realisedCostBps(snap, { tokensOut: 0.0598 });
    expect(bps).toBeCloseTo((20 / 0.0598 / 333.98 - 1) * 10_000, 6);
  });
});

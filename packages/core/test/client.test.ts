import { describe, expect, it } from "vitest";
import { Web3ApiClient, Web3ApiError, type KeyIssue } from "../src/web3api/client";

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

function client(fetchImpl: () => Promise<Response>, seen: (KeyIssue | null)[]) {
  return new Web3ApiClient({
    apiKey: "key",
    secretKey: "secret",
    fetchImpl: fetchImpl as typeof fetch,
    onKeyStatus: (issue) => seen.push(issue),
  });
}

describe("key status reporting", () => {
  it("flags keys the gateway rejects (40101)", async () => {
    const seen: (KeyIssue | null)[] = [];
    const api = client(reply(401, { code: 40101, msg: "Invalid API Key", data: null }), seen);
    await expect(api.get("/api/v1/dex/market/rwa/platforms")).rejects.toBeInstanceOf(Web3ApiError);
    expect(seen).toEqual([{ code: 40101, message: "Invalid API Key", httpStatus: 401 }]);
  });

  it("does not flag a single replayed request (40103)", async () => {
    const seen: (KeyIssue | null)[] = [];
    const api = client(reply(401, { code: 40103, msg: "Timestamp expired or request replayed", data: null }), seen);
    await expect(api.get("/api/v1/dex/market/rwa/price")).rejects.toBeInstanceOf(Web3ApiError);
    expect(seen).toEqual([]);
  });

  it("does not flag per-endpoint failures such as a missing permission (40104)", async () => {
    const seen: (KeyIssue | null)[] = [];
    const api = client(reply(403, { code: 40104, msg: "Permission denied", data: null }), seen);
    await expect(api.get("/api/v2/b402/supported")).rejects.toBeInstanceOf(Web3ApiError);
    expect(seen).toEqual([]);
  });

  it("clears the flag after a successful call", async () => {
    const seen: (KeyIssue | null)[] = [];
    const api = client(reply(200, { code: 0, msg: "success", data: [] }), seen);
    await expect(api.get("/api/v1/dex/market/rwa/platforms")).resolves.toEqual([]);
    expect(seen).toEqual([null]);
  });
});

describe("per-endpoint pacing", () => {
  it("never starts more than the configured requests per endpoint in one second", async () => {
    const starts: number[] = [];
    const api = new Web3ApiClient({
      apiKey: "key",
      secretKey: "secret",
      perEndpointRps: 2,
      fetchImpl: (async () => {
        starts.push(Date.now());
        return new Response(JSON.stringify({ code: 0, data: 1 }), { status: 200 });
      }) as typeof fetch,
    });
    await Promise.all(Array.from({ length: 5 }, () => api.get("/api/v1/x")));
    expect(starts).toHaveLength(5);
    for (let i = 2; i < starts.length; i++) {
      expect((starts[i] as number) - (starts[i - 2] as number)).toBeGreaterThanOrEqual(990);
    }
  });
});

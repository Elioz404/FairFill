import { describe, expect, it } from "vitest";
import { buildQuery, preHash, signRequest } from "../src/web3api/sign";

// Expected signatures were computed with Python's hmac module (independent implementation).
const TS = "2026-05-11T10:08:57.715Z";

describe("request signing", () => {
  it("encodes queries like the wire (spaces as %20, order preserved, empty dropped)", () => {
    expect(buildQuery({ keyword: "NVIDIA Corp", platformId: "ondo", tabId: undefined, x: "" })).toBe(
      "keyword=NVIDIA%20Corp&platformId=ondo",
    );
  });

  it("builds the documented pre-hash with the /build prefix", () => {
    expect(preHash(TS, "get", "/build/api/v1/x?a=1", "")).toBe(`${TS}GET/build/api/v1/x?a=1`);
  });

  it("signs GET requests including /build and the raw query", () => {
    const signed = signRequest({
      apiKey: "key",
      secretKey: "test-secret",
      method: "GET",
      path: "/api/v1/dex/market/rwa/search",
      query: { keyword: "NVIDIA Corp", platformId: "ondo" },
      timestamp: TS,
    });
    expect(signed.url).toBe("https://web3.binance.com/build/api/v1/dex/market/rwa/search?keyword=NVIDIA%20Corp&platformId=ondo");
    expect(signed.headers["X-OC-SIGN"]).toBe("54HZkrnZ9uexT4JGTlNCV4Jk7dnyml7nJR8Gqo3cCKA=");
    expect(signed.headers["X-OC-TIMESTAMP"]).toBe(TS);
    expect(signed.body).toBeUndefined();
  });

  it("signs POST bodies byte for byte (B402 envelope)", () => {
    const signed = signRequest({
      apiKey: "key",
      secretKey: "test-secret",
      method: "POST",
      path: "/api/v2/b402/supported",
      body: JSON.stringify({ body: {} }),
      timestamp: TS,
    });
    expect(signed.body).toBe('{"body":{}}');
    expect(signed.headers["X-OC-SIGN"]).toBe("n8/XsoVDf1U3fkJFYzpRUaTaEww6J+JYz331EK9Sioc=");
    expect(signed.headers["Content-Type"]).toBe("application/json");
  });
});

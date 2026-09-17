import { describe, expect, it } from "vitest";
import { loadConfig, parseFeePercent } from "../src/config";

const RECIPIENT = "0x000000000000000000000000000000000000dEaD";

describe("integrator fee config", () => {
  it("accepts the Trading API range (0, 5] with up to two decimals", () => {
    expect(parseFeePercent("0.1")).toBe("0.1");
    expect(parseFeePercent("5")).toBe("5");
    expect(parseFeePercent("1.25")).toBe("1.25");
  });

  it("rejects values the API would answer with 40466", () => {
    for (const bad of ["0", "5.01", "1.326", "-1", "abc", "", undefined]) expect(parseFeePercent(bad)).toBeNull();
  });

  it("stays off unless both percent and recipient are valid", () => {
    expect(loadConfig({}).fee).toBeNull();
    expect(loadConfig({ FAIRFILL_FEE_PERCENT: "0.1" }).fee).toBeNull();
    expect(loadConfig({ FAIRFILL_FEE_RECIPIENT: RECIPIENT }).fee).toBeNull();
    expect(loadConfig({ FAIRFILL_FEE_PERCENT: "0.1", FAIRFILL_FEE_RECIPIENT: "0x123" }).fee).toBeNull();
    expect(loadConfig({ FAIRFILL_FEE_PERCENT: "0.10", FAIRFILL_FEE_RECIPIENT: RECIPIENT }).fee).toEqual({ percent: "0.1", recipient: RECIPIENT });
  });
});

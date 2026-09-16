import { describe, expect, it } from "vitest";
import { fromBaseUnits, toBaseUnits, toDecimalString } from "../src/shared/units";

describe("units", () => {
  it("keeps integers intact", () => {
    expect(toDecimalString(20)).toBe("20");
    expect(toBaseUnits(20, 18)).toBe("20000000000000000000");
  });

  it("avoids floating point noise", () => {
    expect(toBaseUnits(0.1, 18)).toBe("100000000000000000");
    expect(toBaseUnits("0.01", 18)).toBe("10000000000000000");
    expect(toBaseUnits(1e-7, 18)).toBe("100000000000");
  });

  it("truncates beyond the token precision", () => {
    expect(toBaseUnits("1.1234567", 6)).toBe("1123456");
  });

  it("rejects zero and malformed input", () => {
    expect(() => toBaseUnits(0, 18)).toThrow();
    expect(() => toBaseUnits("-1", 18)).toThrow();
    expect(() => toBaseUnits("abc", 18)).toThrow();
  });

  it("round-trips base units", () => {
    expect(fromBaseUnits("123450000000000000000", 18)).toBe("123.45");
    expect(fromBaseUnits("5", 18)).toBe("0.000000000000000005");
    expect(fromBaseUnits(10n ** 18n, 18)).toBe("1");
  });
});

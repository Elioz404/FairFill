import { describe, expect, it } from "vitest";
import { alignCandles, seriesSummary, timeGrid } from "../src/shared/history";

describe("price history", () => {
  it("builds a grid that ends on the current step", () => {
    const now = Date.UTC(2026, 8, 16, 12, 7);
    const grid = timeGrid("1d", now);
    expect(grid).toHaveLength(288);
    expect(grid.at(-1)).toBe(Date.UTC(2026, 8, 16, 12, 5));
    expect(grid[1]! - grid[0]!).toBe(5 * 60_000);
  });

  it("carries the last trade forward and leaves the gap before the first candle empty", () => {
    const grid = [0, 10, 20, 30, 40];
    const values = alignCandles(
      [
        { t: 15, close: 200 },
        { t: 31, close: 210 },
      ],
      grid,
      1,
    );
    expect(values).toEqual([null, null, 200, 200, 210]);
  });

  it("converts token prices to per-share prices", () => {
    expect(alignCandles([{ t: 0, close: 101 }], [0], 1.01)).toEqual([100]);
  });

  it("ignores broken candles", () => {
    expect(alignCandles([{ t: 0, close: Number.NaN }, { t: 1, close: 0 }], [0, 1], 1)).toEqual([null, null]);
  });

  it("summarizes change over the window", () => {
    const s = seriesSummary([null, 100, 101, 110]);
    expect(s.first).toBe(100);
    expect(s.last).toBe(110);
    expect(s.changePct).toBeCloseTo(10);
  });
});

import type { IssuerId } from "./types";

export type HistoryRange = "1d" | "1w" | "1m";

export const HISTORY_RANGES: Record<HistoryRange, { label: string; interval: string; stepMs: number; points: number }> = {
  "1d": { label: "24H", interval: "5m", stepMs: 5 * 60_000, points: 288 },
  "1w": { label: "7D", interval: "1h", stepMs: 60 * 60_000, points: 168 },
  "1m": { label: "30D", interval: "4h", stepMs: 4 * 60 * 60_000, points: 180 },
};

export interface Candle {
  /** Candle open time (ms). */
  t: number;
  close: number;
}

export interface PriceSeries {
  issuer: IssuerId;
  symbol: string;
  address: string;
  /** Per-share closes on the shared time grid; null before the first candle. */
  values: (number | null)[];
  /** Open time of the most recent candle — candles only exist when something traded. */
  lastTradeAt: number | null;
  /** Candles returned by the source for the window. */
  candleCount: number;
}

export interface PriceHistory {
  ticker: string;
  range: HistoryRange;
  times: number[];
  series: PriceSeries[];
  source: "web3-api" | "public";
}

export function timeGrid(range: HistoryRange, now = Date.now()): number[] {
  const { stepMs, points } = HISTORY_RANGES[range];
  const last = Math.floor(now / stepMs) * stepMs;
  return Array.from({ length: points }, (_, i) => last - (points - 1 - i) * stepMs);
}

/**
 * Carry the last traded close forward onto the grid. A venue with no trades draws a flat line —
 * which is exactly what a stale price is.
 */
export function alignCandles(candles: Candle[], grid: number[], shareRatio: number): (number | null)[] {
  const sorted = [...candles].filter((c) => Number.isFinite(c.close) && c.close > 0).sort((a, b) => a.t - b.t);
  const out: (number | null)[] = [];
  let i = 0;
  let last: number | null = null;
  for (const t of grid) {
    while (i < sorted.length && (sorted[i] as Candle).t <= t) {
      last = (sorted[i] as Candle).close / (shareRatio > 0 ? shareRatio : 1);
      i += 1;
    }
    out.push(last);
  }
  return out;
}

/** Latest non-null value and its change over the window, for sparklines and stat tiles. */
export function seriesSummary(values: (number | null)[]): { first: number | null; last: number | null; changePct: number | null } {
  const present = values.filter((v): v is number => v !== null);
  const first = present[0] ?? null;
  const last = present.at(-1) ?? null;
  return { first, last, changePct: first && last ? ((last - first) / first) * 100 : null };
}

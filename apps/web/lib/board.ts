import { FEATURED_TICKERS, rankVenues, seriesSummary, type TapeSnapshot } from "@fairfill/core";
import { getEngine } from "./server";

export interface BoardRow {
  snapshot: TapeSnapshot;
  /** 24h per-share closes of the fair venue, for the sparkline. */
  trend: number[];
  trendChangePct: number | null;
}

/** Featured tickers with a 24h trend of each one's fair venue. */
export async function loadBoard(tickers: string[] = FEATURED_TICKERS): Promise<BoardRow[]> {
  const engine = getEngine();
  const snapshots = await engine.board(tickers);
  return Promise.all(
    snapshots.map(async (snapshot) => {
      const best = rankVenues(snapshot.venues).ranked[0];
      if (!best) return { snapshot, trend: [], trendChangePct: null };
      const history = await engine.history(snapshot.listing.ticker, "1d", [best.version.issuer]).catch(() => null);
      const values = history?.series[0]?.values ?? [];
      // Down-sample 288 points to 48 for a sparkline.
      const trend = values.filter((v, i): v is number => v !== null && i % 6 === 0);
      return { snapshot, trend, trendChangePct: seriesSummary(values).changePct };
    }),
  );
}

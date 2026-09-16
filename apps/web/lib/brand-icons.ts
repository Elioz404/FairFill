import {
  siApple,
  siCircle,
  siDell,
  siGoogle,
  siMeta,
  siNetflix,
  siNvidia,
  siPalantir,
  siPaypal,
  siQualcomm,
  siReddit,
  siRobinhood,
  siSeagate,
  siTesla,
} from "simple-icons";

/**
 * Company marks from Simple Icons (CC0 package), drawn monochrome to stay inside the BNB palette.
 * Only symbol-style marks are used: wordmarks (AMD, Arm, Coinbase, Intel, Nokia, SpaceX, ...) are
 * unreadable at icon size, and brands with a restrictive license are left out. Everything else,
 * ETFs included, falls back to the ticker monogram.
 * Binance's own token icons are not hotlinked: its CDN rejects third-party referrers.
 */
export const BRAND_ICONS: Record<string, { title: string; path: string }> = {
  AAPL: siApple,
  CRCL: siCircle,
  DELL: siDell,
  GOOGL: siGoogle,
  HOOD: siRobinhood,
  META: siMeta,
  NFLX: siNetflix,
  NVDA: siNvidia,
  PLTR: siPalantir,
  PYPL: siPaypal,
  QCOM: siQualcomm,
  RDDT: siReddit,
  STX: siSeagate,
  TSLA: siTesla,
};

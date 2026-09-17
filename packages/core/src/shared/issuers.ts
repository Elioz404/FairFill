import type { ExecutionMode, IssuerId } from "./types";

export interface IssuerInfo {
  id: IssuerId;
  label: string;
  suffix: string;
  /** `type` in the Trading API and the public catalog. */
  catalogType: 1 | 2 | 3;
  /** `platformId` in the RWA Data API, when the issuer is covered by it. */
  rwaPlatformId: "ondo" | "bstock" | null;
  execution: ExecutionMode[];
  executionLabel: string;
  hours: string;
  notes: string[];
  /** Monochrome identity: marker shape and chart line style (no per-issuer hue). */
  mark: "solid" | "ring" | "dotted";
  dash: string | null;
}

// Facts below come from the Binance Web3 API docs (Trading API → Equity Token Trading).
export const ISSUERS: Record<IssuerId, IssuerInfo> = {
  bstocks: {
    id: "bstocks",
    label: "bStocks",
    suffix: "B",
    catalogType: 3,
    rwaPlatformId: "bstock",
    execution: ["SWAP", "RFQ"],
    executionLabel: "AMM + RFQ",
    hours: "AMM route trades around the clock; the RFQ route only while the exchange is open",
    notes: [
      "Routed through LiquidMesh (swap) and PcsXRfq (RFQ); one quote can return both",
      "RFQ outside trading hours fails with 40369",
    ],
    mark: "solid",
    dash: null,
  },
  ondo: {
    id: "ondo",
    label: "Ondo",
    suffix: "on",
    catalogType: 1,
    rwaPlatformId: "ondo",
    execution: ["RFQ"],
    executionLabel: "RFQ only",
    hours: "Quotes only while the Ondo market status is open",
    notes: [
      "Always routed through 3-vendor RFQ (InchFusion, CowSwap, PcsXRfq)",
      "Market closed fails with 40367; minimum order size enforced with 40375",
      "Must be paired with a whitelisted stablecoin (USDT on BSC)",
    ],
    mark: "ring",
    dash: "7 4",
  },
  xstocks: {
    id: "xstocks",
    label: "xStocks",
    suffix: "x",
    catalogType: 2,
    rwaPlatformId: null,
    execution: ["SWAP"],
    executionLabel: "AMM only",
    hours: "AMM pools, no session gate — but BSC pools can be empty",
    notes: [
      "Not covered by the RWA Data API platform filter (ondo | bstock only)",
      "On 2026-09-16 the BSC pools we measured showed zero liquidity",
      "On 2026-09-17 the quote endpoint asked for a wallet address, then reported no liquidity (40374)",
    ],
    mark: "dotted",
    dash: "1.5 4",
  },
};

export const ISSUER_ORDER: IssuerId[] = ["bstocks", "ondo", "xstocks"];

export function issuerFromCatalogType(type: number): IssuerId | null {
  for (const info of Object.values(ISSUERS)) {
    if (info.catalogType === type) return info.id;
  }
  return null;
}

export function issuerFromPlatformId(platformId: string | null | undefined): IssuerId | null {
  if (platformId === "ondo") return "ondo";
  if (platformId === "bstock") return "bstocks";
  return null;
}

/** Suffix rules from the official agentic-wallet skill: …on = Ondo, …B = bStocks, …x = xStocks. */
export function issuerFromSymbol(symbol: string): IssuerId | null {
  if (symbol.endsWith("on")) return "ondo";
  if (symbol.endsWith("x")) return "xstocks";
  if (symbol.endsWith("B")) return "bstocks";
  return null;
}

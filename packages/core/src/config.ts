import { DEFAULT_POLICY, type RankPolicy } from "./shared/rank";
import { TOKENS } from "./shared/constants";

export interface EngineConfig {
  apiKey: string | null;
  secretKey: string | null;
  quoteWallet: string | null;
  baseUrl: string;
  policy: RankPolicy;
  journal: { enabled: boolean; dir: string };
  x402: { payTo: string | null; priceUsd: string; asset: string };
}

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value && Number.isFinite(n) ? n : fallback;
};

const isAddress = (value: string | undefined) => !!value && /^0x[0-9a-fA-F]{40}$/.test(value);

export function loadConfig(env: Record<string, string | undefined> = process.env): EngineConfig {
  return {
    apiKey: env.BINANCE_WEB3_API_KEY || null,
    secretKey: env.BINANCE_WEB3_SECRET_KEY || null,
    quoteWallet: isAddress(env.FAIRFILL_QUOTE_WALLET) ? (env.FAIRFILL_QUOTE_WALLET as string) : null,
    baseUrl: (env.FAIRFILL_BASE_URL || "http://localhost:3000").replace(/\/$/, ""),
    policy: {
      minOnchainVolumeUsd: num(env.FAIRFILL_MIN_ONCHAIN_VOLUME_USD, DEFAULT_POLICY.minOnchainVolumeUsd),
      maxPriceImpactPct: num(env.FAIRFILL_MAX_PRICE_IMPACT_PCT, DEFAULT_POLICY.maxPriceImpactPct),
    },
    journal: {
      enabled: (env.FAIRFILL_JOURNAL ?? "on") !== "off",
      dir: env.FAIRFILL_JOURNAL_DIR || ".dx-journal",
    },
    x402: {
      payTo: isAddress(env.FAIRFILL_X402_PAY_TO) ? (env.FAIRFILL_X402_PAY_TO as string) : null,
      priceUsd: env.FAIRFILL_X402_PRICE_USD || "0.01",
      asset: isAddress(env.FAIRFILL_X402_ASSET) ? (env.FAIRFILL_X402_ASSET as string) : TOKENS.U.address,
    },
  };
}

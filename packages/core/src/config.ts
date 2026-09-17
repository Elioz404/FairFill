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
  /** Optional integrator fee on AMM (SWAP) routes. RFQ routes ignore it (Trading API docs). */
  fee: { percent: string; recipient: string } | null;
}

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value && Number.isFinite(n) ? n : fallback;
};

const isAddress = (value: string | undefined) => !!value && /^0x[0-9a-fA-F]{40}$/.test(value);

/** The Trading API accepts feePercent in (0, 5] on EVM chains with at most two decimals (40466 otherwise). */
export function parseFeePercent(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 && n <= 5 ? String(n) : null;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): EngineConfig {
  return {
    apiKey: env.BINANCE_WEB3_API_KEY || null,
    secretKey: env.BINANCE_WEB3_SECRET_KEY || null,
    quoteWallet: isAddress(env.FAIRFILL_QUOTE_WALLET) ? (env.FAIRFILL_QUOTE_WALLET as string) : null,
    baseUrl: baseUrl(env),
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
    fee: feeConfig(env),
  };
}

function feeConfig(env: Record<string, string | undefined>): EngineConfig["fee"] {
  const percent = parseFeePercent(env.FAIRFILL_FEE_PERCENT);
  // Both values are required; a half-configured fee stays off rather than guessing.
  return percent && isAddress(env.FAIRFILL_FEE_RECIPIENT) ? { percent, recipient: env.FAIRFILL_FEE_RECIPIENT as string } : null;
}

/** Explicit FAIRFILL_BASE_URL wins; on Vercel the production domain is known (without protocol). */
function baseUrl(env: Record<string, string | undefined>): string {
  const explicit = env.FAIRFILL_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

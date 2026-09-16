import { fmtDuration } from "./format";
import type { MarketStatus, SessionInfo } from "./types";

const STATUSES: MarketStatus[] = ["premarket", "regular", "postmarket", "overnight", "closed", "pause"];

export const UNKNOWN_SESSION: SessionInfo = {
  open: null,
  status: "unknown",
  reasonCode: null,
  reasonMsg: null,
  nextOpenTime: null,
  nextCloseTime: null,
};

/** Normalize a `statusInfo` object (RWA Data API or public status endpoint). */
export function toSession(raw: unknown): SessionInfo {
  if (!raw || typeof raw !== "object") return UNKNOWN_SESSION;
  const r = raw as Record<string, unknown>;
  const status = STATUSES.includes(r.marketStatus as MarketStatus) ? (r.marketStatus as MarketStatus) : "unknown";
  const reasonCode = typeof r.reasonCode === "string" ? r.reasonCode : null;
  let open: boolean | null = typeof r.openState === "boolean" ? r.openState : null;
  if (open === null && reasonCode === "TRADING") open = true;
  return {
    open,
    status,
    reasonCode,
    reasonMsg: typeof r.reasonMsg === "string" ? r.reasonMsg : null,
    nextOpenTime: typeof r.nextOpenTime === "number" ? r.nextOpenTime : null,
    nextCloseTime: typeof r.nextCloseTime === "number" ? r.nextCloseTime : null,
  };
}

export function isCorporateAction(session: SessionInfo): boolean {
  return session.reasonCode === "ASSET_PAUSED" || session.reasonCode === "ASSET_LIMITED";
}

export function isWeekendLike(session: SessionInfo): boolean {
  return session.open === false && /weekend|holiday/i.test(session.reasonMsg ?? "");
}

export interface SessionSummary {
  tone: "open" | "extended" | "closed" | "halted" | "unknown";
  label: string;
  detail: string | null;
}

export function describeSession(session: SessionInfo, now = Date.now()): SessionSummary {
  if (isCorporateAction(session)) {
    return { tone: "halted", label: "Corporate action", detail: session.reasonMsg };
  }
  if (session.open === true) {
    const tone = session.status === "regular" ? "open" : "extended";
    const label = session.status === "regular" ? "US market open" : `US ${session.status} session`;
    const detail = session.nextCloseTime ? `closes in ${fmtDuration(session.nextCloseTime - now)}` : null;
    return { tone, label, detail };
  }
  if (session.open === false) {
    const label = session.status === "pause" ? "Trading paused" : "US market closed";
    const parts = [session.reasonMsg, session.nextOpenTime ? `opens in ${fmtDuration(session.nextOpenTime - now)}` : null];
    return { tone: session.status === "pause" ? "halted" : "closed", label, detail: parts.filter(Boolean).join(" · ") || null };
  }
  return { tone: "unknown", label: "Session unknown", detail: null };
}

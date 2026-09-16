"use client";

import { describeSession, isCorporateAction, type SessionInfo } from "@fairfill/core/shared";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { useNow, usePoll } from "./live";

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const hms = [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  return d > 0 ? `${d}d ${hms}` : hms;
}

export function sessionTarget(session: SessionInfo): { label: string; at: number | null } {
  if (session.open === true) return { label: "closes in", at: session.nextCloseTime };
  if (session.open === false) return { label: "opens in", at: session.nextOpenTime };
  return { label: "", at: null };
}

/** Header pill: live session state with a ticking countdown, refreshed every minute. */
export function SessionPill({ initial }: { initial: SessionInfo }) {
  const { data } = usePoll<SessionInfo>("/api/session", 60_000, initial);
  const session = data ?? initial;
  const now = useNow(1000);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const s = describeSession(session, now);
  const target = sessionTarget(session);
  const live = session.open === true && !isCorporateAction(session);
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-line bg-ink-850 px-2.5 py-1 text-xs">
      <span className={clsx("size-1.5 rounded-full", live ? "bg-gold animate-pulse-dot" : "bg-fg-faint")} />
      <span className="font-medium text-fg">{s.label}</span>
      {target.at && mounted ? (
        <span className="num text-fg-muted">
          {target.label} {clock(target.at - now)}
        </span>
      ) : null}
    </span>
  );
}

/** Large session readout for the market pulse section. */
export function SessionClock({ initial }: { initial: SessionInfo }) {
  const { data } = usePoll<SessionInfo>("/api/session", 60_000, initial);
  const session = data ?? initial;
  const now = useNow(1000);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const s = describeSession(session, now);
  const target = sessionTarget(session);
  const nyTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={clsx("size-2 rounded-full", session.open ? "bg-gold animate-pulse-dot" : "bg-fg-faint")} />
        <span className="text-sm font-medium text-fg">{s.label}</span>
      </div>
      <p className="figure mt-4 text-5xl text-fg" suppressHydrationWarning>
        {mounted && target.at ? clock(target.at - now) : "--:--:--"}
      </p>
      <p className="mt-1 text-xs text-fg-muted">{target.at ? `${target.label.replace(" in", "")} countdown` : "No schedule reported"}</p>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-line bg-ink-850 p-2.5">
          <dt className="text-fg-muted">New York time</dt>
          <dd className="num mt-1 text-sm text-fg" suppressHydrationWarning>
            {mounted ? nyTime.format(now) : "--:--:--"}
          </dd>
        </div>
        <div className="rounded-lg border border-line bg-ink-850 p-2.5">
          <dt className="text-fg-muted">Session state</dt>
          <dd className="num mt-1 text-sm text-fg">{session.status}</dd>
        </div>
      </dl>
    </div>
  );
}

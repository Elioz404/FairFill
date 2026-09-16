"use client";

import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/** Re-renders every `intervalMs` with the current time. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Polls a JSON endpoint. Keeps the previous data while refetching (no skeleton flash),
 * pauses while the tab is hidden, and refreshes as soon as it becomes visible again.
 */
export function usePoll<T>(url: string | null, intervalMs: number, initial: T | null = null) {
  const [data, setData] = useState<T | null>(initial);
  const [updatedAt, setUpdatedAt] = useState<number>(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!url) return;
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setRefreshing(true);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      const json = (await res.json()) as T & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (controller.current === ctrl) setRefreshing(false);
    }
  }, [url]);

  const firstUrl = useRef(url);
  useEffect(() => {
    if (!url) return;
    // Server-provided data covers the first URL only; any later URL loads right away.
    if (initial === null || url !== firstUrl.current) {
      firstUrl.current = null;
      void refresh();
    }
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      controller.current?.abort();
    };
    // `initial` only matters on mount, so it is deliberately not a dependency.
  }, [url, intervalMs, refresh]);

  return { data, updatedAt, refreshing, error, refresh };
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Tweens to each new value and briefly highlights the change. */
export function AnimatedNumber({
  value,
  format,
  className,
  duration = 700,
}: {
  value: number | null;
  format: (v: number | null) => string;
  className?: string;
  duration?: number;
}) {
  const [shown, setShown] = useState<number | null>(value);
  const [flashKey, setFlashKey] = useState(0);
  const from = useRef<number | null>(value);

  useEffect(() => {
    const start = from.current;
    if (value === null || start === null || start === value || prefersReducedMotion()) {
      if (start !== null && value !== null && start !== value) setFlashKey((k) => k + 1);
      from.current = value;
      setShown(value);
      return;
    }
    setFlashKey((k) => k + 1);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + (value - start) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration]);

  return (
    <span key={flashKey} className={clsx(className, flashKey > 0 && "flash rounded-sm")}>
      {format(shown)}
    </span>
  );
}

/** Counts up once the element scrolls into view. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    let raf = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / 1100);
        setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString("en-US")}
    </span>
  );
}

/** "Updated 8s ago" with a ring that fills until the next refresh. */
export function RefreshIndicator({ updatedAt, intervalMs, refreshing }: { updatedAt: number; intervalMs: number; refreshing: boolean }) {
  const now = useNow(1000);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Server and first client render agree on a zero age; the clock starts after hydration.
  const age = mounted ? Math.max(0, now - updatedAt) : 0;
  const progress = Math.min(1, age / intervalMs);
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-fg-muted" aria-live="off">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className={clsx(refreshing && "animate-spin")}>
        <circle cx="8" cy="8" r={r} fill="none" stroke="var(--color-ink-700)" strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={refreshing ? c * 0.75 : c * (1 - progress)}
          transform="rotate(-90 8 8)"
        />
      </svg>
      {refreshing ? "Updating…" : `Updated ${Math.round(age / 1000)}s ago`}
    </span>
  );
}

/** Signed percent change with a direction arrow, in neutral ink. */
export function Delta({ pct, className }: { pct: number | null; className?: string }) {
  if (pct === null || !Number.isFinite(pct)) return <span className={clsx("text-fg-muted", className)}>—</span>;
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={clsx("inline-flex items-center gap-0.5 text-fg-soft", className)}>
      <Icon className="size-3.5" aria-hidden />
      {up ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

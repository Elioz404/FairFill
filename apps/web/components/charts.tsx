"use client";

import { ISSUERS, fmtUsd, type PriceHistory } from "@fairfill/core/shared";
import clsx from "clsx";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IssuerMark } from "./primitives";

const GOLD = "var(--color-gold)";
const CONTEXT = "var(--color-series-context)";
const DIM = "var(--color-series-dim)";
const SURFACE = "var(--color-ink-800)";
const GRID = "var(--color-line)";

/** 12–48 point trend line. Accent for the story, gray for context. */
export function Sparkline({
  values,
  emphasis = false,
  width = 112,
  height = 32,
  label,
  fluid = false,
}: {
  values: number[];
  emphasis?: boolean;
  width?: number;
  height?: number;
  label: string;
  /** Stretch to the container width (the end marker is drawn in HTML so it stays round). */
  fluid?: boolean;
}) {
  const gradientId = useId();
  if (values.length < 2) {
    return (
      <span className="inline-flex items-center text-[11px] text-fg-muted" style={{ width: fluid ? "100%" : width, height }}>
        no trades in window
      </span>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 4;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const stroke = emphasis ? GOLD : CONTEXT;
  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1] as number);
  if (fluid) {
    return (
      <div className="relative w-full" style={{ height }}>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} className="block overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={emphasis ? "#f0b90b" : "#c4c5cb"} stopOpacity="0.14" />
              <stop offset="100%" stopColor={emphasis ? "#f0b90b" : "#c4c5cb"} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d}L${lastX},${height}L${x(0)},${height}Z`} fill={`url(#${gradientId})`} />
          <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span
          aria-hidden
          className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-ink-800"
          style={{ left: `${(lastX / width) * 100}%`, top: lastY, background: stroke }}
        />
      </div>
    );
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={emphasis ? "#f0b90b" : "#c4c5cb"} stopOpacity="0.14" />
          <stop offset="100%" stopColor={emphasis ? "#f0b90b" : "#c4c5cb"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L${lastX},${height}L${x(0)},${height}Z`} fill={`url(#${gradientId})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="4" fill={stroke} stroke={SURFACE} strokeWidth="2" />
    </svg>
  );
}

function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw));
  const base = raw / 10 ** exp;
  const nice = base <= 1 ? 1 : base <= 2 ? 2 : base <= 2.5 ? 2.5 : base <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

const timeFormat = (range: PriceHistory["range"]) =>
  range === "1d"
    ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

const tooltipTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * Per-share price of every version over time. Emphasis form: the fair venue in yellow,
 * the others in gray; issuer identity also carried by line style and the legend.
 */
export function PriceChart({ history, emphasisAddress, dimmed = false }: { history: PriceHistory; emphasisAddress: string | null; dimmed?: boolean }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const height = 260;
  const margin = { top: 12, right: 64, bottom: 28, left: 8 };
  const plotW = Math.max(120, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;
  const n = history.times.length;

  const ordered = useMemo(() => {
    // Draw context first so the accent line sits on top.
    return [...history.series].sort((a, b) => Number(a.address === emphasisAddress) - Number(b.address === emphasisAddress));
  }, [history.series, emphasisAddress]);

  const all = history.series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (all.length === 0) {
    return (
      <div ref={ref} className="grid h-[260px] place-items-center text-sm text-fg-muted">
        No trades in this window.
      </div>
    );
  }
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const step = niceStep((rawMax - rawMin || rawMax * 0.01) / 4);
  const yMin = Math.floor(rawMin / step) * step;
  const yMax = Math.ceil(rawMax / step) * step;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(v);

  const x = (i: number) => margin.left + (i / Math.max(1, n - 1)) * plotW;
  const y = (v: number) => margin.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;
  const color = (address: string, index: number) => (address === emphasisAddress ? GOLD : index === 0 ? CONTEXT : DIM);
  const contextIndex = new Map(history.series.filter((s) => s.address !== emphasisAddress).map((s, i) => [s.address, i]));

  const pathFor = (values: (number | null)[]) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const fmt = timeFormat(history.range);
  const xTickCount = width < 480 ? 3 : 6;
  const xTicks = Array.from({ length: xTickCount }, (_, k) => Math.round((k / (xTickCount - 1)) * (n - 1)));

  const pick = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - margin.left;
    return Math.max(0, Math.min(n - 1, Math.round((px / plotW) * (n - 1))));
  };

  const hoverIndex = hover ?? null;
  const tooltipLeft = hoverIndex !== null ? Math.min(Math.max(x(hoverIndex) + 12, 0), width - 190) : 0;

  return (
    <div ref={ref} className={clsx("min-w-0 transition-opacity", dimmed && "opacity-60")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Legend">
          {history.series.map((s) => (
            <li key={s.address} className="flex items-center gap-2 text-xs text-fg-soft">
              <svg width="22" height="8" aria-hidden>
                <line
                  x1="1"
                  x2="21"
                  y1="4"
                  y2="4"
                  stroke={color(s.address, contextIndex.get(s.address) ?? 0)}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={ISSUERS[s.issuer].dash ?? undefined}
                />
              </svg>
              <span className="num">{s.symbol}</span>
              <span className="text-fg-muted">
                {s.candleCount} {s.candleCount === 1 ? "candle" : "candles"}
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="rounded-md border border-line px-2 py-1 text-[11px] text-fg-muted transition hover:border-line-strong hover:text-fg"
          aria-pressed={asTable}
        >
          {asTable ? "Chart view" : "Table view"}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-[260px] overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-ink-800 text-fg-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                {history.series.map((s) => (
                  <th key={s.address} className="num px-3 py-2 text-right font-medium">
                    {s.symbol}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.times
                .map((t, i) => ({ t, i }))
                .filter(({ i }) => i % Math.ceil(n / 24) === 0 || i === n - 1)
                .reverse()
                .map(({ t, i }) => (
                  <tr key={t} className="border-t border-line/70">
                    <td className="px-3 py-1.5 text-fg-muted">{tooltipTime.format(t)}</td>
                    {history.series.map((s) => (
                      <td key={s.address} className="num px-3 py-1.5 text-right text-fg-soft">
                        {fmtUsd(s.values[i] ?? null)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Per-share price of each ${history.ticker} version over ${history.range}`}
            tabIndex={0}
            className="block touch-none outline-none"
            onPointerMove={(e) => setHover(pick(e.clientX, e.currentTarget.getBoundingClientRect()))}
            onPointerLeave={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n - 1) - 1));
              if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? 0) + 1));
              if (e.key === "Escape") setHover(null);
            }}
            onBlur={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={margin.left} x2={margin.left + plotW} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
                <text x={margin.left + plotW + 8} y={y(t) + 4} fill="var(--color-fg-faint)" fontSize="10.5" className="num">
                  {t.toLocaleString("en-US", { minimumFractionDigits: step < 1 ? 2 : 0, maximumFractionDigits: step < 1 ? 2 : 0 })}
                </text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text key={i} x={x(i)} y={height - 8} fill="var(--color-fg-faint)" fontSize="10.5" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
                {fmt.format(history.times[i] as number)}
              </text>
            ))}

            {ordered.map((s) => {
              const stroke = color(s.address, contextIndex.get(s.address) ?? 0);
              const lastIndex = s.values.findLastIndex((v) => v !== null);
              const last = lastIndex >= 0 ? (s.values[lastIndex] as number) : null;
              return (
                <g key={s.address}>
                  <path
                    d={pathFor(s.values)}
                    fill="none"
                    stroke={stroke}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={ISSUERS[s.issuer].dash ?? undefined}
                  />
                  {last !== null ? <circle cx={x(lastIndex)} cy={y(last)} r="4" fill={stroke} stroke={SURFACE} strokeWidth="2" /> : null}
                </g>
              );
            })}

            {hoverIndex !== null ? (
              <g>
                <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={margin.top} y2={margin.top + plotH} stroke="var(--color-fg-faint)" strokeWidth="1" />
                {history.series.map((s) => {
                  const v = s.values[hoverIndex];
                  return v === null || v === undefined ? null : (
                    <circle
                      key={s.address}
                      cx={x(hoverIndex)}
                      cy={y(v)}
                      r="4"
                      fill={color(s.address, contextIndex.get(s.address) ?? 0)}
                      stroke={SURFACE}
                      strokeWidth="2"
                    />
                  );
                })}
              </g>
            ) : null}
          </svg>

          {hoverIndex !== null ? (
            <div
              className="pointer-events-none absolute top-2 w-[178px] rounded-lg border border-line-strong bg-ink-900/95 p-2.5 text-xs shadow-xl backdrop-blur"
              style={{ left: tooltipLeft }}
              role="status"
            >
              <p className="text-[11px] text-fg-muted">{tooltipTime.format(history.times[hoverIndex] as number)}</p>
              <ul className="mt-1.5 space-y-1">
                {history.series.map((s) => (
                  <li key={s.address} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-fg-muted">
                      <IssuerMark issuer={s.issuer} tone={s.address === emphasisAddress ? "accent" : "default"} size={8} />
                      <span className="num">{s.symbol}</span>
                    </span>
                    <span className="num font-semibold text-fg">{fmtUsd(s.values[hoverIndex] ?? null)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

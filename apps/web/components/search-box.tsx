"use client";

import type { IssuerId } from "@fairfill/core/shared";
import clsx from "clsx";
import { ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { IssuerMark } from "./primitives";

interface Result {
  ticker: string;
  name: string | null;
  issuers: IssuerId[];
}

export function SearchBox({ size = "lg", autoFocus = false }: { size?: "lg" | "sm"; autoFocus?: boolean }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key === "/" && target?.tagName !== "INPUT" && target?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const body = (await res.json()) as { results?: Result[] };
        setResults(body.results ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 140);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const go = (ticker: string) => {
    setOpen(false);
    router.push(`/s/${ticker}`);
  };

  const large = size === "lg";
  return (
    <div className="relative w-full">
      <label
        className={clsx(
          "group flex items-center gap-3 rounded-xl border border-line-strong bg-ink-850/90 backdrop-blur transition focus-within:border-gold/60 focus-within:shadow-[0_0_0_4px_rgb(240_185_11/0.14)]",
          large ? "px-5 py-4" : "px-3 py-2",
        )}
      >
        <Search className={clsx("shrink-0 text-fg-muted", large ? "size-5" : "size-4")} />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              const pick = results[active] ?? (query.trim() ? { ticker: query.trim().toUpperCase() } : null);
              if (pick) go(pick.ticker);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={large ? "Apple, NVDA, S&P 500…" : "Search stocks"}
          className={clsx("w-full bg-transparent text-fg outline-none placeholder:text-fg-muted", large ? "text-lg" : "text-sm")}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search tokenized stocks"
        />
        {loading ? <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-gold" /> : null}
        <kbd className="num hidden rounded-md border border-line px-1.5 py-0.5 text-[10px] text-fg-muted sm:block">/</kbd>
      </label>

      {open && results.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="panel absolute inset-x-0 top-[calc(100%+8px)] z-30 overflow-hidden p-1.5 animate-rise"
        >
          {results.map((r, i) => (
            <li
              key={r.ticker}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(r.ticker);
              }}
              onMouseEnter={() => setActive(i)}
              className={clsx(
                "flex cursor-pointer items-center justify-between gap-4 rounded-xl px-3 py-2.5",
                i === active ? "bg-ink-700" : "hover:bg-ink-750",
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="num w-14 shrink-0 text-sm font-semibold text-fg">{r.ticker}</span>
                <span className="truncate text-sm text-fg-muted">{r.name ?? "—"}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  {r.issuers.map((issuer) => (
                    <IssuerMark key={issuer} issuer={issuer} />
                  ))}
                </span>
                <span className="num text-[11px] text-fg-muted">
                  {r.issuers.length} version{r.issuers.length > 1 ? "s" : ""}
                </span>
                <ArrowRight className={clsx("size-3.5", i === active ? "text-gold" : "text-fg-muted")} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

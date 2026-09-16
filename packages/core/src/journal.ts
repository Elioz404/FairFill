import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Developer Experience journal. Every Binance Web3 API call is recorded with
 * its latency and the exact business code + message, so the DX report can
 * quote real numbers instead of impressions.
 */
export interface JournalEntry {
  ts: number;
  method: string;
  endpoint: string;
  httpStatus: number | null;
  code: string | number | null;
  message: string | null;
  ok: boolean;
  ms: number;
}

export interface EndpointStats {
  endpoint: string;
  calls: number;
  errors: number;
  p50: number;
  p95: number;
  max: number;
  lastError: { code: string | number | null; message: string | null; ts: number } | null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] as number;
}

export function summarize(entries: JournalEntry[]): EndpointStats[] {
  const groups = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const key = `${e.method} ${e.endpoint}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([endpoint, list]) => {
      const latencies = list.map((e) => e.ms).sort((a, b) => a - b);
      const errors = list.filter((e) => !e.ok);
      const last = errors.at(-1);
      return {
        endpoint,
        calls: list.length,
        errors: errors.length,
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        max: latencies.at(-1) ?? 0,
        lastError: last ? { code: last.code, message: last.message, ts: last.ts } : null,
      };
    })
    .sort((a, b) => b.calls - a.calls);
}

export class Journal {
  private readonly memory: JournalEntry[] = [];
  private readonly file: string | null;
  private readonly maxInMemory: number;
  private dirReady: Promise<unknown> | null = null;

  constructor(opts: { enabled: boolean; dir: string; maxInMemory?: number }) {
    this.file = opts.enabled ? path.resolve(opts.dir, "journal.jsonl") : null;
    this.maxInMemory = opts.maxInMemory ?? 2_000;
  }

  record(entry: JournalEntry): void {
    this.memory.push(entry);
    if (this.memory.length > this.maxInMemory) this.memory.shift();
    if (!this.file) return;
    const file = this.file;
    this.dirReady ??= mkdir(path.dirname(file), { recursive: true }).catch(() => null);
    // Fire and forget: journaling must never break a request (read-only filesystems included).
    void this.dirReady.then(() => appendFile(file, `${JSON.stringify(entry)}\n`)).catch(() => null);
  }

  recent(): JournalEntry[] {
    return [...this.memory];
  }

  /** Entries persisted by earlier processes plus this one. */
  async all(): Promise<JournalEntry[]> {
    if (!this.file) return this.recent();
    try {
      const text = await readFile(this.file, "utf8");
      return text
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as JournalEntry);
    } catch {
      return this.recent();
    }
  }
}

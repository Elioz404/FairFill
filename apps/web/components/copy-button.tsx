"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-ink-800 px-2 py-1 text-[11px] font-medium text-fg-muted transition hover:border-line-strong hover:text-fg"
    >
      {copied ? <Check className="size-3.5 text-gold" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({ code, label, wrap = false }: { code: string; label?: string; wrap?: boolean }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-ink-950">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="eyebrow">{label ?? "shell"}</span>
        <CopyButton value={code} />
      </div>
      <pre
        className={
          wrap
            ? "num whitespace-pre-wrap break-words p-4 text-[12.5px] leading-relaxed text-fg-muted"
            : "num overflow-x-auto p-4 text-[12.5px] leading-relaxed text-fg-muted"
        }
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

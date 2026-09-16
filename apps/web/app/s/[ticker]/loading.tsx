export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6" aria-busy="true" aria-live="polite">
      <div className="h-4 w-32 animate-pulse rounded bg-ink-800" />
      <div className="mt-10 flex items-center gap-4">
        <div className="size-16 animate-pulse rounded-xl bg-ink-800" />
        <div className="space-y-3">
          <div className="h-3 w-40 animate-pulse rounded bg-ink-800" />
          <div className="h-12 w-72 animate-pulse rounded bg-ink-800" />
        </div>
      </div>
      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-80 animate-pulse rounded-2xl border border-line bg-ink-850" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-2xl border border-line bg-ink-850" />
      </div>
      <p className="sr-only">Quoting every version…</p>
    </div>
  );
}

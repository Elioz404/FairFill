import { ISSUERS } from "@fairfill/core/shared";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { IssuerMark } from "@/components/primitives";
import { StockLogo } from "@/components/stock-logo";
import { SearchBox } from "@/components/search-box";
import { OrderTicket } from "@/components/stock/order-ticket";
import { LiveReference, StockLive } from "@/components/stock/stock-live";
import { getEngine } from "@/lib/server";

export async function generateMetadata(props: PageProps<"/s/[ticker]">): Promise<Metadata> {
  const { ticker } = await props.params;
  return { title: `${ticker.toUpperCase()} fair fill` };
}

const ASSET_TYPE: Record<number, string> = { 1: "Stock", 2: "Pre-IPO", 3: "ETF" };

export default async function StockPage(props: PageProps<"/s/[ticker]">) {
  await connection();
  const { ticker } = await props.params;
  const engine = getEngine();
  const [tape, history] = await Promise.all([engine.tape(ticker), engine.history(ticker, "1d").catch(() => null)]);
  if (!tape) notFound();

  const { listing } = tape;
  const assetType = listing.versions.find((v) => v.assetType)?.assetType;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-fg-muted">
          <Link href="/#tape" className="hover:text-fg">
            Tape
          </Link>
          <ChevronRight className="size-3" />
          <span className="num text-fg-soft">{listing.ticker}</span>
        </nav>
        <div className="w-full max-w-xs">
          <SearchBox size="sm" />
        </div>
      </div>

      <header className="mt-8 flex flex-wrap items-end justify-between gap-8">
        <div className="flex items-center gap-4">
          <StockLogo ticker={listing.ticker} logoUrl={listing.logoUrl} size="lg" />
          <div>
            <p className="eyebrow">
              {assetType ? (ASSET_TYPE[assetType] ?? "Asset") : "Asset"} · {listing.versions.length} version{listing.versions.length > 1 ? "s" : ""} on BSC
            </p>
            <h1 className="heading mt-1 text-4xl sm:text-5xl">{listing.name ?? listing.ticker}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="num rounded-md border border-line px-2 py-0.5 text-xs text-fg-soft">{listing.ticker}</span>
              {listing.versions.map((v) => (
                <span key={v.address} className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <IssuerMark issuer={v.issuer} /> {ISSUERS[v.issuer].label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <LiveReference initial={tape} />
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-10">
          <StockLive initial={tape} initialHistory={history} />

          <section>
            <h2 className="text-lg font-semibold tracking-tight">What actually differs</h2>
            <div className="panel mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-[0.1em] text-fg-muted">
                    <th className="px-4 py-3 font-medium">Issuer</th>
                    <th className="px-4 py-3 font-medium">How it trades</th>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Watch out for</th>
                  </tr>
                </thead>
                <tbody>
                  {listing.versions.map((v) => {
                    const info = ISSUERS[v.issuer];
                    return (
                      <tr key={v.address} className="border-b border-line/70 align-top last:border-0">
                        <td className="px-4 py-3.5">
                          <span className="flex items-center gap-2 font-medium">
                            <IssuerMark issuer={v.issuer} /> {info.label}
                          </span>
                          <span className="num text-xs text-fg-muted">{v.symbol}</span>
                        </td>
                        <td className="px-4 py-3.5 text-fg-soft">{info.executionLabel}</td>
                        <td className="px-4 py-3.5 text-fg-soft">{info.hours}</td>
                        <td className="px-4 py-3.5 text-xs leading-relaxed text-fg-muted">{info.notes.join(" · ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-fg-muted">Execution facts from the Binance Web3 API Trading API documentation.</p>
          </section>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <OrderTicket ticker={listing.ticker} name={listing.name} issuers={listing.versions.map((v) => v.issuer)} mode={tape.mode} />
        </aside>
      </div>
    </div>
  );
}

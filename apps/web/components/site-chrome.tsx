import type { DataMode, SessionInfo } from "@fairfill/core/shared";
import Link from "next/link";
import { Wordmark } from "./logo";
import { ModeBadge } from "./primitives";
import { SessionPill } from "./session";

const NAV = [
  { href: "/#tape", label: "Tape" },
  { href: "/#pulse", label: "Market pulse" },
  { href: "/#how", label: "How it works" },
  { href: "/agents", label: "For agents" },
  { href: "/log", label: "Builder log" },
];

export function SiteHeader({ mode, session }: { mode: DataMode; session: SessionInfo | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink-950/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="shrink-0" aria-label="FairFill home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md px-3 py-2 text-sm text-fg-muted transition hover:bg-ink-800 hover:text-fg">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          {session ? (
            <span className="hidden lg:block">
              <SessionPill initial={session} />
            </span>
          ) : null}
          <ModeBadge mode={mode} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-fg-muted">
            Best execution for tokenized stocks, building on BNB Chain. Made for BNB Hack: Tokenized Stocks Edition with the Binance Web3 API,
            Binance Agentic Wallet and BNB Agent Studio.
          </p>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3">Product</p>
          <ul className="space-y-2 text-fg-muted">
            <li><Link className="hover:text-fg" href="/#tape">Consolidated tape</Link></li>
            <li><Link className="hover:text-fg" href="/agents">Skill, MCP and x402</Link></li>
            <li><Link className="hover:text-fg" href="/log">Builder log</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3">Sources</p>
          <ul className="space-y-2 text-fg-muted">
            <li><a className="hover:text-fg" href="https://web3.binance.com/en/dev-docs/introduction" target="_blank" rel="noreferrer">Binance Web3 API</a></li>
            <li><a className="hover:text-fg" href="https://github.com/binance/binance-skills-hub" target="_blank" rel="noreferrer">Binance Skills Hub</a></li>
            <li><a className="hover:text-fg" href="https://www.bnbchain.org/en/hackathons/tokenized-stocks" target="_blank" rel="noreferrer">The hackathon</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs leading-relaxed text-fg-muted sm:px-6">
          FairFill compares execution venues; it does not tell you what to buy. Not investment advice. Tokenized securities are not
          covered by securities insurance, can be halted for corporate actions and may be restricted where you live.
        </p>
      </div>
    </footer>
  );
}

import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { getEngine } from "@/lib/server";
import "./globals.css";

const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "FairFill — best execution for tokenized stocks", template: "%s · FairFill" },
  description:
    "The same US stock exists as bStocks, Ondo and xStocks tokens on BNB Chain. FairFill picks the fair one, explains why, and fills it with the Binance Agentic Wallet.",
};

export const viewport: Viewport = { themeColor: "#0b0e11" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  const engine = getEngine();
  const [session] = await Promise.all([engine.marketSession(), engine.probe()]);
  const issue = engine.apiKeyIssue;
  return (
    <html lang="en" className={`${grotesk.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <div className="backdrop" aria-hidden />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-gold focus:px-3 focus:py-2 focus:text-ink-950">
          Skip to content
        </a>
        <SiteHeader mode={engine.mode} keyIssue={issue ? { code: issue.code, message: issue.message } : null} session={session} />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

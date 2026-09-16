import { Bot, Coins, Plug } from "lucide-react";
import Link from "next/link";
import { CodeBlock } from "../copy-button";

const STEPS = [
  { n: "01", title: "Understand", body: "“Buy $20 of Apple” becomes AAPL — every version on BSC.", modules: ["RWA Data · search", "catalog"] },
  { n: "02", title: "Check sessions", body: "Market status, corporate actions and halts, per version.", modules: ["RWA Data · underlying-market"] },
  { n: "03", title: "Quote them all", body: "Same size, same stablecoin, SWAP and RFQ routes in parallel.", modules: ["Trading API · quote"] },
  { n: "04", title: "Normalize", body: "Per share, token-to-share ratio, network fee, fair reference.", modules: ["RWA Data · price", "Market · price-info"] },
  { n: "05", title: "Simulate and fill", body: "Dry-run the transaction, then fill with the Agentic Wallet or your wallet.", modules: ["Transaction API · simulate", "Agentic Wallet"] },
  { n: "06", title: "Receipt", body: "What you paid against the reference and against every alternative.", modules: ["Wallet API · tx detail", "RFQ order status"] },
];

export function Pipeline() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
      {STEPS.map((step) => (
        <li key={step.n} className="group bg-ink-850 p-6 transition-colors hover:bg-ink-800">
          <div className="flex items-center gap-3">
            <span className="num grid size-8 place-items-center rounded-md border border-line-strong text-xs text-fg-soft transition-colors group-hover:border-gold/60 group-hover:text-gold">
              {step.n}
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <h3 className="mt-4 text-lg font-semibold tracking-tight">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">{step.body}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {step.modules.map((m) => (
              <span key={m} className="num rounded-md border border-line bg-ink-800 px-2 py-0.5 text-[10.5px] text-fg-soft">
                {m}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AgentsTeaser({ baseUrl }: { baseUrl: string }) {
  const cards = [
    {
      icon: Bot,
      title: "Talk to it",
      body: (
        <>
          Install the FairFill skill next to the Binance Agentic Wallet. Your agent picks the fair version, then fills it with{" "}
          <span className="num text-fg-soft">baw</span>.
        </>
      ),
      code: <CodeBlock label="prompt" wrap code={`Use FairFill to buy $20 of Apple with my Binance Agentic Wallet.`} />,
    },
    {
      icon: Plug,
      title: "Plug it in",
      body: <>An MCP server with four read-only tools: search, compare versions, best route and session. Runs over stdio in any MCP client.</>,
      code: <CodeBlock label="stdio command" code={`pnpm -s --dir <repo> mcp`} />,
    },
    {
      icon: Coins,
      title: "Pay per route",
      body: <>Agents buy a best-execution route for one cent over x402 v2. Settlement runs through B402 on BSC, gas-sponsored.</>,
      code: <CodeBlock label="http" code={`GET ${baseUrl}/api/x402/route\n  ?ticker=AAPL&side=buy&amountUsd=20\n# 402 PAYMENT-REQUIRED`} />,
    },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {cards.map((card) => (
        <article key={card.title} className="panel min-w-0 p-6">
          <span className="grid size-9 place-items-center rounded-md border border-line-strong">
            <card.icon className="size-4 text-gold" />
          </span>
          <h3 className="mt-4 text-lg font-semibold tracking-tight">{card.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">{card.body}</p>
          <div className="mt-5">{card.code}</div>
        </article>
      ))}
      <p className="text-sm text-fg-muted lg:col-span-3">
        Full setup, the Agent Studio seller and the exact commands are on the{" "}
        <Link href="/agents" className="text-gold hover:text-gold-bright">
          agents page
        </Link>
        .
      </p>
    </div>
  );
}

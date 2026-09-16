import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { CodeBlock } from "@/components/copy-button";
import { SectionHeading } from "@/components/primitives";
import { getEngine } from "@/lib/server";

export const metadata: Metadata = { title: "For agents" };

function Block({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-line py-12 lg:grid-cols-[280px_1fr]">
      <div>
        <p className="num text-xs text-gold">{n}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="min-w-0 space-y-4 text-sm leading-relaxed text-fg-muted">{children}</div>
    </section>
  );
}

export default async function AgentsPage() {
  await connection();
  const engine = getEngine();
  const base = engine.config.baseUrl;
  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-14 sm:px-6">
      <SectionHeading eyebrow="For agents" title={<>Give your agent <span className="text-gold">best execution</span>.</>}>
        One engine, four ways in. Everything read-only is free; the paid endpoint costs one cent per route and settles on BSC through
        B402. Execution always happens in a wallet the user controls.
      </SectionHeading>

      <div className="mt-12">
        <Block n="01" title="Skill + Agentic Wallet">
          <p>
            The FairFill skill teaches any agent that can run shell commands (Codex, Gemini CLI, Hermes, OpenClaw) to resolve a stock to its
            fair version before trading. The Binance Agentic Wallet skill then fills it with <span className="num text-fg">baw</span> — within
            the daily limit and token rules the user set in the Binance App.
          </p>
          <CodeBlock
            code={`# 1. Binance Agentic Wallet (official)\nnpx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet\n\n# 2. FairFill skill (from this repository)\nnpx skills add <your-github-user>/fairfill/skills/fairfill`}
          />
          <CodeBlock
            label="prompt"
            wrap
            code={`Use FairFill to buy $20 of NVIDIA on BSC. Show me the fair version and the quote, then fill it with my Binance Agentic Wallet after I confirm.`}
          />
        </Block>

        <Block n="02" title="MCP server">
          <p>
            Four read-only tools: <span className="num text-fg">fairfill_search</span>, <span className="num text-fg">fairfill_compare</span>,{" "}
            <span className="num text-fg">fairfill_best_route</span> and <span className="num text-fg">fairfill_session</span>. It runs the engine
            locally with your keys, or proxies this deployment when <span className="num text-fg">FAIRFILL_API_URL</span> is set.
          </p>
          <CodeBlock label="stdio command" code={`pnpm -s --dir /path/to/fairfill mcp`} />
          <CodeBlock
            label="cursor · .cursor/mcp.json"
            code={`{\n  "mcpServers": {\n    "fairfill": {\n      "command": "pnpm",\n      "args": ["-s", "--dir", "/path/to/fairfill", "mcp"]\n    }\n  }\n}`}
          />
        </Block>

        <Block n="03" title="Paid route over x402">
          <p>
            <span className="num text-fg">GET /api/x402/route</span> answers with HTTP 402 and a <span className="num text-fg">PAYMENT-REQUIRED</span>{" "}
            header (x402 v2, exact scheme, BSC). The buyer signs, replays with <span className="num text-fg">PAYMENT-SIGNATURE</span>, FairFill
            verifies with B402, computes the route, settles, and returns the route with a <span className="num text-fg">PAYMENT-RESPONSE</span>{" "}
            header. If the route fails, nothing is settled.
          </p>
          <CodeBlock code={`curl -i "${base}/api/x402/route?ticker=AAPL&side=buy&amountUsd=20&wallet=0xYourWallet"`} />
          <CodeBlock
            label="with the agentic wallet"
            code={`baw x402-payment preview --paymentRequirements <PAYMENT-REQUIRED header> --json\nbaw x402-payment sign --paymentId <paymentId> --selectedIndex 1 --json\n# replay the GET with the returned PAYMENT-SIGNATURE header`}
          />
          <p>
            Check what the endpoint currently asks for at <span className="num text-fg">GET /api/x402/status</span> — no payment needed.
          </p>
        </Block>

        <Block n="04" title="BNB Agent Studio seller">
          <p>
            <span className="num text-fg">agents/studio</span> contains drop-in read-only tools for an Agent Studio seller. Buyers pay through
            ERC-8183 jobs or x402; the agent&apos;s LLM calls FairFill to write a best-execution report, and signing stays in Studio&apos;s fixed{" "}
            <span className="num text-fg">signing.ts</span>. The agent is discoverable on-chain through its ERC-8004 identity.
          </p>
          <CodeBlock
            code={`npm install --global @bnbagent/studio-cli\nbag skills install --target cursor --scope user\nbag init fairfillagent --protocols A2A,MCP,X402 --rails both --b402-price 0.01\n# then add the tools from agents/studio/fairfillTools.ts`}
          />
        </Block>

        <Block n="05" title="Plain HTTP">
          <CodeBlock
            code={`curl "${base}/api/search?q=apple"\ncurl "${base}/api/tape/AAPL"\ncurl -X POST "${base}/api/route" \\\n  -H "Content-Type: application/json" \\\n  -d '{"ticker":"AAPL","side":"buy","amountUsd":20}'`}
          />
        </Block>
      </div>
    </div>
  );
}

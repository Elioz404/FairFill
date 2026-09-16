import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Secrets live in the repo-root .env so the web app, MCP server and smoke test share them.
function findRepoRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const root = findRepoRoot(process.cwd());
const rootEnv = root ? path.join(root, ".env") : null;
if (rootEnv && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
// Keep the DX journal in one place regardless of where the server was started.
if (root && !process.env.FAIRFILL_JOURNAL_DIR) process.env.FAIRFILL_JOURNAL_DIR = path.join(root, ".dx-journal");

const nextConfig: NextConfig = {
  transpilePackages: ["@fairfill/core"],
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "bin.bnbstatic.com" },
      { protocol: "https", hostname: "static.onchainos.com" },
    ],
  },
};

export default nextConfig;

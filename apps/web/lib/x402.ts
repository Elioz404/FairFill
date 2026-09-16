import { X402Gate } from "@fairfill/core";
import { getEngine } from "./server";

let gate: X402Gate | null = null;

export function getGate(): X402Gate {
  const engine = getEngine();
  gate ??= new X402Gate(engine.requireApi(), engine.config.x402, process.env.NEXT_PUBLIC_BSC_RPC_URL || undefined);
  return gate;
}

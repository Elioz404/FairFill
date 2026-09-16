/**
 * Token amount conversion without floating point. Amounts on the wire are
 * integer strings in the token's smallest unit.
 */

export function toDecimalString(amount: number | string): string {
  if (typeof amount === "string") return amount.trim();
  if (!Number.isFinite(amount)) throw new Error(`Invalid amount: ${amount}`);
  // String() is the shortest exact round-trip form; only exponent forms need expanding.
  const text = String(amount);
  if (!/e/i.test(text)) return text;
  const fixed = amount.toFixed(18);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

export function toBaseUnits(amount: number | string, decimals: number): string {
  const text = toDecimalString(amount);
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`Invalid amount: ${text}`);
  const [whole = "0", fraction = ""] = text.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
  if (raw <= 0n) throw new Error("Amount must be greater than zero");
  return raw.toString();
}

export function fromBaseUnits(raw: string | bigint, decimals: number): string {
  const value = typeof raw === "bigint" ? raw : BigInt(raw);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** For display and ratios only — never for amounts sent on-chain. */
export function fromBaseUnitsNumber(raw: string | bigint, decimals: number): number {
  return Number(fromBaseUnits(raw, decimals));
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

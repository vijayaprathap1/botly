import { pricingTable, type ModelPricing } from "./config";

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

export const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  };
}

export function pricingFor(model: string, table = pricingTable()): { pricing: ModelPricing; known: boolean } {
  const exact = table[model];
  if (exact) return { pricing: exact, known: true };
  // Dated snapshots like claude-haiku-4-5-20251001 use their alias price.
  const alias = Object.keys(table).find((k) => model.startsWith(k));
  if (alias) return { pricing: table[alias]!, known: true };
  return { pricing: table["claude-haiku-4-5"] ?? { input: 1, output: 5, cache_write: 1.25, cache_read: 0.1 }, known: false };
}

/** USD cost of one API usage record. `input` excludes cached tokens, as in the Anthropic usage object. */
export function computeCostUsd(usage: Usage, pricing: ModelPricing): number {
  const usd =
    (usage.input * pricing.input +
      usage.output * pricing.output +
      usage.cacheRead * pricing.cache_read +
      usage.cacheWrite * pricing.cache_write) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

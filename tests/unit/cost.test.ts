import { describe, expect, it } from "vitest";
import { computeCostUsd, pricingFor } from "@/lib/cost";

describe("cost", () => {
  const table = { "claude-haiku-4-5": { input: 1, output: 5, cache_write: 1.25, cache_read: 0.1 } };
  it("computes from per-MTok prices", () => {
    const { pricing } = pricingFor("claude-haiku-4-5", table);
    // 2,000 in, 150 out, 20,000 cache read, 0 write
    expect(computeCostUsd({ input: 2000, output: 150, cacheRead: 20000, cacheWrite: 0 }, pricing)).toBeCloseTo(0.00475, 6);
  });
  it("dated snapshots resolve to their alias", () => {
    expect(pricingFor("claude-haiku-4-5-20251001", table).known).toBe(true);
    expect(pricingFor("some-other-model", table).known).toBe(false);
  });
});

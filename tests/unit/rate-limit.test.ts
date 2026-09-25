import { describe, expect, it } from "vitest";
import { checkLimits, MemoryRateLimiter } from "@/lib/security/rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit per window then blocks", async () => {
    let now = Date.UTC(2026, 8, 24, 10, 0, 0);
    const rl = new MemoryRateLimiter(() => now);
    for (let i = 1; i <= 20; i++) expect((await rl.hit("v:1", 20, 600)).allowed).toBe(true);
    expect((await rl.hit("v:1", 20, 600)).allowed).toBe(false);
    // Different key is independent.
    expect((await rl.hit("v:2", 20, 600)).allowed).toBe(true);
    // Next window resets.
    now += 600_000;
    expect((await rl.hit("v:1", 20, 600)).allowed).toBe(true);
  });

  it("checkLimits reports the first blocking rule", async () => {
    const rl = new MemoryRateLimiter(() => 0);
    const rules = [
      { key: "visitor:a", limit: 2, windowSeconds: 600, reason: "visitor" },
      { key: "bot:x", limit: 100, windowSeconds: 60, reason: "bot" },
    ];
    expect(await checkLimits(rl, rules)).toBeNull();
    expect(await checkLimits(rl, rules)).toBeNull();
    const blocked = await checkLimits(rl, rules);
    expect(blocked?.reason).toBe("visitor");
  });
});

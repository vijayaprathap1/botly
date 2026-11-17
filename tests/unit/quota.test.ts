import { describe, expect, it } from "vitest";
import { monthlyCap } from "@/lib/plans";
import { conversationAllowance, monthKey, quotaState, shouldSendQuotaWarning, sumOrgUsage } from "@/lib/quota";

describe("quota", () => {
  it("states", () => {
    expect(quotaState(0, 2000).state).toBe("ok");
    expect(quotaState(1599, 2000).state).toBe("ok");
    expect(quotaState(1600, 2000).state).toBe("warning");
    expect(quotaState(1999, 2000).state).toBe("warning");
    expect(quotaState(2000, 2000).state).toBe("exceeded");
    expect(quotaState(5, 0).state).toBe("exceeded");
    expect(quotaState(1000, 2000).percent).toBe(50);
  });
  describe("one monthly limit shared by the whole workspace", () => {
    const allow = (orgCap: number, orgUsed: number, botUsed: number, botOverride: number | null = null) =>
      conversationAllowance({ orgCap, botOverride, orgUsed, botUsed });
    // begin_conversation refuses when the assistant's own count >= quota.
    const canStart = (a: { quota: number }, botUsed: number) => botUsed < a.quota;

    it("a single assistant gets exactly the plan's number", () => {
      expect(allow(500, 0, 0)).toEqual({ quota: 500, used: 0, limit: 500, scope: "workspace" });
      expect(canStart(allow(500, 499, 499), 499)).toBe(true);
      expect(canStart(allow(500, 500, 500), 500)).toBe(false);
    });

    it("Pro's 3 assistants share 10,000 in total, not 10,000 each", () => {
      // Assistant A used 6,000 and B 4,000: the workspace is at 10,000, so C (0 used) can't start one.
      expect(allow(10_000, 10_000, 0).quota).toBe(0);
      expect(canStart(allow(10_000, 10_000, 0), 0)).toBe(false);
      // At 9,999 any assistant may start exactly one more.
      expect(allow(10_000, 9_999, 4_000).quota).toBe(4_001);
      expect(allow(10_000, 9_999, 0).quota).toBe(1);
    });

    it("simulated month: the workspace total never passes the plan's number", () => {
      const used: Record<string, number> = { a: 0, b: 0, c: 0 };
      let total = 0;
      for (let i = 0; i < 40_000; i++) {
        const bot = ["a", "b", "c"][i % 3]!;
        if (canStart(allow(10_000, total, used[bot]!), used[bot]!)) {
          used[bot]!++;
          total++;
        }
      }
      expect(total).toBe(10_000);
    });

    it("top-ups add to the shared total (still workspace-wide)", () => {
      const cap = monthlyCap(10_000, { topup_month: "2026-11-01", topup_conversations: 500 }, "2026-11-01");
      expect(cap).toBe(10_500);
      expect(allow(cap, 10_000, 3_000).quota).toBe(3_500);
      expect(allow(cap, 10_500, 3_000).quota).toBe(3_000);
    });

    it("the admin per-assistant cap only tightens, never lifts the workspace", () => {
      expect(allow(2_000, 100, 100, 500)).toEqual({ quota: 500, used: 100, limit: 500, scope: "assistant" });
      expect(allow(2_000, 1_900, 100, 5_000)).toMatchObject({ quota: 200, scope: "workspace" });
      expect(allow(2_000, 2_000, 0, 5_000).quota).toBe(0);
    });

    it("sums usage rows per workspace", () => {
      expect(sumOrgUsage([])).toEqual({ total: 0, byBot: {}, warned: false });
      expect(sumOrgUsage([{ bot_id: "a", conversations: 3 }, { bot_id: "b", conversations: 4, quota_warned_at: "2026-11-02T00:00:00Z" }])).toEqual({ total: 7, byBot: { a: 3, b: 4 }, warned: true });
    });
  });
  it("warns once at 80%", () => {
    expect(shouldSendQuotaWarning(1599, 2000, false)).toBe(false);
    expect(shouldSendQuotaWarning(1600, 2000, false)).toBe(true);
    expect(shouldSendQuotaWarning(1700, 2000, true)).toBe(false);
  });
  it("month key uses the org timezone", () => {
    // 2026-09-30 20:00 UTC is already 1 October in India.
    const d = new Date("2026-09-30T20:00:00Z");
    expect(monthKey(d, "Asia/Kolkata")).toBe("2026-10-01");
    expect(monthKey(d, "UTC")).toBe("2026-09-01");
  });
});

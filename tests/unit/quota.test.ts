import { describe, expect, it } from "vitest";
import { effectiveQuota, monthKey, quotaState, shouldSendQuotaWarning } from "@/lib/quota";

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
  it("bot override wins", () => {
    expect(effectiveQuota(2000, null)).toBe(2000);
    expect(effectiveQuota(2000, 500)).toBe(500);
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

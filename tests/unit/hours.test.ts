import { describe, expect, it } from "vitest";
import { formatHours, isOpenNow } from "@/lib/hours";

const hours = {
  mon: [["10:00", "19:00"]], tue: [["10:00", "19:00"]], wed: [["10:00", "19:00"]], thu: [["10:00", "19:00"]],
  fri: [["10:00", "19:00"]], sat: [["10:00", "19:00"]], sun: [],
} as const;

describe("business hours", () => {
  it("formats compactly", () => {
    expect(formatHours(hours as never)).toBe("Mon–Sat 10:00–19:00; Sun closed");
  });
  it("open/closed in the org timezone", () => {
    // Thu 24 Sep 2026 05:00 UTC = 10:30 IST → open
    expect(isOpenNow(hours as never, "Asia/Kolkata", new Date("2026-09-24T05:00:00Z"))).toBe(true);
    // 14:00 UTC = 19:30 IST → closed
    expect(isOpenNow(hours as never, "Asia/Kolkata", new Date("2026-09-24T14:00:00Z"))).toBe(false);
    // Sunday
    expect(isOpenNow(hours as never, "Asia/Kolkata", new Date("2026-09-27T06:00:00Z"))).toBe(false);
  });
});

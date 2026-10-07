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

describe("hours typed by the owner at sign-up", () => {
  it("reads common formats", async () => {
    const { parseHoursText, formatHours } = await import("@/lib/hours");
    expect(formatHours(parseHoursText("Mon–Sat 10 am – 8 pm")!)).toBe("Mon–Sat 10:00–20:00; Sun closed");
    expect(formatHours(parseHoursText("Mon-Fri 9:30-18:00, Sat 10am-2pm")!)).toBe("Mon–Fri 09:30–18:00; Sat 10:00–14:00; Sun closed");
    expect(formatHours(parseHoursText("10am to 9pm daily")!)).toBe("Mon–Sun 10:00–21:00");
    expect(formatHours(parseHoursText("Monday to Saturday: 10 - 8 pm; Sunday closed")!)).toBe("Mon–Sat 10:00–20:00; Sun closed");
    expect(formatHours(parseHoursText("Weekdays 9am-6pm, weekends 10am-4pm")!)).toBe("Mon–Fri 09:00–18:00; Sat–Sun 10:00–16:00");
  });
  it("gives up instead of guessing, and 'not set' hours are never stated as fact", async () => {
    const { parseHoursText, formatHours, hoursNotSet, isOpenNow, HOURS_NOT_SET } = await import("@/lib/hours");
    for (const t of ["", "call us", "by appointment only", "Mon-Sat mornings", "8pm - 10am"]) expect(parseHoursText(t)).toBeNull();
    expect(hoursNotSet(parseHoursText("Open 24 hours"))).toBe(true);
    expect(formatHours(HOURS_NOT_SET)).toMatch(/^not specified/);
    expect(isOpenNow(HOURS_NOT_SET, "Asia/Kolkata", new Date("2026-10-11T21:30:00Z"))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  addDays,
  availability,
  bookingWindow,
  dayLabel,
  findSlot,
  localDate,
  rangesFor,
  slotsForDay,
  summarizeAvailability,
  time12,
  tzOffsetMinutes,
  weekdayOf,
  zonedTime,
  type BookingRules,
  type Busy,
  type DateOverride,
} from "@/lib/booking/slots";
import { DEFAULT_WEEKLY_HOURS, defaultSettings, effectiveServices, rulesFrom } from "@/lib/booking/types";

// Tue 17 Nov 2026, 09:00 IST (03:30 UTC).
const NOW = new Date("2026-11-17T03:30:00Z");
const rules = (o: Partial<BookingRules> = {}): BookingRules => ({
  timezone: "Asia/Kolkata",
  slotIntervalMinutes: 30,
  bufferMinutes: 0,
  minNoticeMinutes: 0,
  maxDaysAhead: 30,
  capacityPerSlot: 1,
  dailyLimit: null,
  weeklyHours: { tue: [["10:00", "13:00"], ["14:00", "17:00"]], wed: [["10:00", "12:00"]], sun: [] },
  ...o,
});
const day = (date: string, o: Partial<BookingRules> = {}, extra: { busy?: Busy[]; overrides?: DateOverride[]; duration?: number; now?: Date } = {}) =>
  slotsForDay({ date, rules: rules(o), overrides: extra.overrides ?? [], durationMinutes: extra.duration ?? 30, busy: extra.busy ?? [], now: extra.now ?? NOW });
const times = (s: { time: string }[]) => s.map((x) => x.time);
const ist = (date: string, hhmm: string) => zonedTime(date, hhmm, "Asia/Kolkata").toISOString();

describe("time zones", () => {
  it("IST is +5:30 all year and wall-clock times map to the right instant", () => {
    expect(tzOffsetMinutes(Date.parse("2026-01-01T00:00:00Z"), "Asia/Kolkata")).toBe(330);
    expect(tzOffsetMinutes(Date.parse("2026-07-01T00:00:00Z"), "Asia/Kolkata")).toBe(330);
    expect(ist("2026-11-17", "10:00")).toBe("2026-11-17T04:30:00.000Z");
    expect(ist("2026-11-18", "00:15")).toBe("2026-11-17T18:45:00.000Z");
  });
  it("local date rolls over at IST midnight, not UTC midnight", () => {
    expect(localDate(new Date("2026-11-17T18:29:00Z"), "Asia/Kolkata")).toBe("2026-11-17");
    expect(localDate(new Date("2026-11-17T18:31:00Z"), "Asia/Kolkata")).toBe("2026-11-18");
  });
  it("handles a daylight-saving zone on both sides of the change", () => {
    // London: BST (+1) until 25 Oct 2026, then GMT.
    expect(zonedTime("2026-10-20", "10:00", "Europe/London").toISOString()).toBe("2026-10-20T09:00:00.000Z");
    expect(zonedTime("2026-10-26", "10:00", "Europe/London").toISOString()).toBe("2026-10-26T10:00:00.000Z");
    const r = rules({ timezone: "Europe/London", weeklyHours: { mon: [["09:00", "10:00"]] } });
    const s = slotsForDay({ date: "2026-10-26", rules: r, overrides: [], durationMinutes: 30, busy: [], now: new Date("2026-10-20T00:00:00Z") });
    expect(s.map((x) => x.start)).toEqual(["2026-10-26T09:00:00.000Z", "2026-10-26T09:30:00.000Z"]);
  });
  it("weekday and date helpers", () => {
    expect(weekdayOf("2026-11-17")).toBe("tue");
    expect(weekdayOf("2026-11-22")).toBe("sun");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayLabel("2026-11-17")).toMatch(/Tue.*17.*Nov/);
    expect(time12("09:00")).toBe("9 am");
    expect(time12("12:30")).toBe("12:30 pm");
    expect(time12("00:00")).toBe("12 am");
    expect(time12("17:45")).toBe("5:45 pm");
  });
});

describe("slotsForDay", () => {
  it("steps through each range and leaves the lunch break out", () => {
    const s = times(day("2026-11-17"));
    expect(s[0]).toBe("10:00");
    expect(s).toContain("12:30");
    expect(s).not.toContain("13:00");
    expect(s).not.toContain("13:30");
    expect(s).toContain("14:00");
    expect(s.at(-1)).toBe("16:30");
    expect(s).toHaveLength(12);
  });
  it("a long service must fit before the break or closing time", () => {
    const s = times(day("2026-11-17", {}, { duration: 60 }));
    expect(s).toContain("12:00");
    expect(s).not.toContain("12:30");
    expect(s.at(-1)).toBe("16:00");
  });
  it("closed weekday and a day with no hours give nothing", () => {
    expect(day("2026-11-22")).toEqual([]); // Sunday: []
    expect(day("2026-11-19")).toEqual([]); // Thursday: not set
  });
  it("a holiday override closes the day; special hours replace the weekly hours", () => {
    expect(day("2026-11-17", {}, { overrides: [{ date: "2026-11-17", closed: true, hours: [] }] })).toEqual([]);
    const special = day("2026-11-19", {}, { overrides: [{ date: "2026-11-19", closed: false, hours: [["16:00", "17:00"]] }] });
    expect(times(special)).toEqual(["16:00", "16:30"]);
  });
  it("minimum notice hides times that are too soon", () => {
    // 09:00 now + 2h notice → first slot 11:00.
    expect(times(day("2026-11-17", { minNoticeMinutes: 120 }))[0]).toBe("11:00");
    // Past times today are never offered.
    expect(times(day("2026-11-17", {}, { now: new Date(ist("2026-11-17", "14:10")) }))[0]).toBe("14:30");
  });
  it("only dates inside the booking window", () => {
    expect(day("2026-11-16")).toEqual([]); // yesterday
    expect(day("2026-11-24", { maxDaysAhead: 6 })).toEqual([]);
    expect(day("2026-11-24", { maxDaysAhead: 7 }).length).toBeGreaterThan(0);
    expect(bookingWindow(rules({ maxDaysAhead: 30 }), NOW)).toEqual({ first: "2026-11-17", last: "2026-12-17" });
    expect(day("not-a-date")).toEqual([]);
  });
  it("a booked time is not offered; buffers block the neighbours", () => {
    const busy = [{ start: ist("2026-11-17", "11:00"), end: ist("2026-11-17", "11:30") }];
    const plain = times(day("2026-11-17", {}, { busy }));
    expect(plain).not.toContain("11:00");
    expect(plain).toContain("10:30");
    expect(plain).toContain("11:30");
    const buffered = times(day("2026-11-17", { bufferMinutes: 15 }, { busy }));
    expect(buffered).not.toContain("10:30");
    expect(buffered).not.toContain("11:30");
    expect(buffered).toContain("10:00");
    expect(buffered).toContain("12:00");
  });
  it("a longer appointment blocks every slot it overlaps", () => {
    const busy = [{ start: ist("2026-11-17", "10:00"), end: ist("2026-11-17", "11:15") }];
    const s = times(day("2026-11-17", {}, { busy }));
    expect(s.slice(0, 2)).toEqual(["11:30", "12:00"]);
  });
  it("capacity: several people per time, with seats left", () => {
    const at10 = { start: ist("2026-11-17", "10:00"), end: ist("2026-11-17", "10:30") };
    const two = day("2026-11-17", { capacityPerSlot: 2 }, { busy: [at10] });
    expect(two[0]).toMatchObject({ time: "10:00", left: 1 });
    const full = day("2026-11-17", { capacityPerSlot: 2 }, { busy: [at10, at10] });
    expect(times(full)).not.toContain("10:00");
  });
  it("daily limit closes the day once reached (counted in the business time zone)", () => {
    const busy = [
      { start: ist("2026-11-17", "10:00"), end: ist("2026-11-17", "10:30") },
      { start: ist("2026-11-17", "15:00"), end: ist("2026-11-17", "15:30") },
    ];
    expect(day("2026-11-17", { dailyLimit: 2 }, { busy })).toEqual([]);
    expect(day("2026-11-17", { dailyLimit: 3 }, { busy }).length).toBeGreaterThan(0);
    // An appointment on another IST day (late night UTC) doesn't count for today.
    const other = [{ start: "2026-11-17T19:00:00Z", end: "2026-11-17T19:30:00Z" }]; // 00:30 IST on the 18th
    expect(day("2026-11-17", { dailyLimit: 1 }, { busy: other }).length).toBeGreaterThan(0);
  });
  it("ignores bad or overlapping ranges", () => {
    expect(rangesFor("2026-11-17", { tue: [["13:00", "10:00"], ["xx", "11:00"]] }, [])).toEqual([]);
    const dup = day("2026-11-17", { weeklyHours: { tue: [["10:00", "11:00"], ["10:30", "11:30"]] } });
    expect(times(dup)).toEqual(["10:00", "10:30", "11:00"]);
  });
});

describe("availability, findSlot and summaries", () => {
  const base = { rules: rules(), overrides: [], durationMinutes: 30, busy: [], now: NOW };
  it("covers the window day by day", () => {
    const days = availability(base);
    expect(days[0]!.date).toBe("2026-11-17");
    expect(days).toHaveLength(31);
    expect(availability({ ...base, fromDate: "2026-11-18", days: 2 }).map((d) => d.date)).toEqual(["2026-11-18", "2026-11-19"]);
  });
  it("findSlot accepts only an exact free start", () => {
    expect(findSlot({ ...base, startIso: ist("2026-11-18", "10:30") })?.time).toBe("10:30");
    expect(findSlot({ ...base, startIso: ist("2026-11-18", "10:10") })).toBeNull();
    expect(findSlot({ ...base, startIso: ist("2026-11-18", "13:00") })).toBeNull();
    expect(findSlot({ ...base, startIso: "garbage" })).toBeNull();
    const busy = [{ start: ist("2026-11-18", "10:30"), end: ist("2026-11-18", "11:00") }];
    expect(findSlot({ ...base, busy, startIso: ist("2026-11-18", "10:30") })).toBeNull();
  });
  it("summary lists the next open days with their first times", () => {
    const sum = summarizeAvailability(availability(base), 2, 3);
    expect(sum).toHaveLength(2);
    expect(sum[0]).toMatchObject({ date: "2026-11-17", times: ["10 am", "10:30 am", "11 am"], more: 9 });
    expect(sum[1]!.date).toBe("2026-11-18");
  });
});

describe("settings defaults", () => {
  it("default week is Mon–Sat with a lunch break, Sunday closed", () => {
    expect(DEFAULT_WEEKLY_HOURS.mon).toEqual([["10:00", "13:00"], ["14:00", "19:00"]]);
    expect(DEFAULT_WEEKLY_HOURS.sun).toEqual([]);
    const s = defaultSettings("b1");
    expect(s.enabled).toBe(false);
    expect(rulesFrom(s)).toMatchObject({ timezone: "Asia/Kolkata", slotIntervalMinutes: 30, minNoticeMinutes: 60 });
  });
  it("no services → one generic appointment the length of a slot", () => {
    const s = { ...defaultSettings("b1"), slot_interval_minutes: 20 };
    const list = effectiveServices([], s);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "default", name: "Appointment", duration_minutes: 20 });
  });
});

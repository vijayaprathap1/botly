/**
 * Appointment slot generation. Pure functions, no I/O: the public API, the chat tool and the
 * tests all use these, so "what the widget offers" and "what the server accepts" can't drift.
 *
 * Times are wall-clock in the business timezone (default Asia/Kolkata). A day's ranges come
 * from a date override when there is one (closed, or special hours), otherwise from the weekly
 * hours. Gaps between ranges are breaks. A start time is offered when:
 *   - the whole appointment fits inside one range (start + duration <= range end),
 *   - it starts at least `minNoticeMinutes` from now, and its date is within `maxDaysAhead`,
 *   - fewer than `capacityPerSlot` active appointments overlap it, buffer included
 *     (the same rule as the database trigger in migration 0016),
 *   - the day has fewer than `dailyLimit` active appointments (when a limit is set).
 */
import { DAYS, type Day } from "../hours";

export type TimeRange = [string, string];
export type WeeklyHours = Partial<Record<Day, TimeRange[]>>;
export type DateOverride = { date: string; closed: boolean; hours: TimeRange[]; note?: string | null };
export type Busy = { start: Date | string; end: Date | string };

export type BookingRules = {
  timezone: string;
  slotIntervalMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  capacityPerSlot: number;
  dailyLimit: number | null;
  weeklyHours: WeeklyHours;
};

export type Slot = { start: string; end: string; time: string; left: number };
export type DaySlots = { date: string; slots: Slot[] };

const MIN = 60_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isDate = (s: unknown): s is string => typeof s === "string" && DATE_RE.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
export const isTime = (s: unknown): s is string => typeof s === "string" && TIME_RE.test(s);
export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const fromMinutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Offset of `tz` from UTC at instant `utcMs`, in minutes (IST = +330). */
export function tzOffsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / MIN);
}

/** The instant a wall-clock time on `date` happens in `tz` (two passes, so DST zones work too). */
export function zonedTime(date: string, hhmm: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)));
  const off1 = tzOffsetMinutes(guess, tz);
  let t = guess - off1 * MIN;
  const off2 = tzOffsetMinutes(t, tz);
  if (off2 !== off1) t = guess - off2 * MIN;
  return new Date(t);
}

/** YYYY-MM-DD of `now` in `tz`. */
export function localDate(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Wall-clock HH:MM of an instant in `tz`. */
export function localTime(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

export function addDays(date: string, n: number): string {
  const t = Date.parse(date + "T00:00:00Z") + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): Day {
  const js = new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return DAYS[(js + 6) % 7]!;
}

/** Ranges that apply on `date`, sorted, invalid ones dropped. */
export function rangesFor(date: string, weekly: WeeklyHours, overrides: DateOverride[]): TimeRange[] {
  const o = overrides.find((x) => x.date === date);
  const raw = o ? (o.closed ? [] : o.hours) : (weekly[weekdayOf(date)] ?? []);
  return raw
    .filter((r): r is TimeRange => Array.isArray(r) && isTime(r[0]) && isTime(r[1]) && toMinutes(r[0]) < toMinutes(r[1]))
    .sort((a, b) => toMinutes(a[0]) - toMinutes(b[0]));
}

/** First and last bookable date: today .. today + maxDaysAhead. */
export function bookingWindow(rules: Pick<BookingRules, "timezone" | "maxDaysAhead">, now: Date): { first: string; last: string } {
  const first = localDate(now, rules.timezone);
  return { first, last: addDays(first, Math.max(0, rules.maxDaysAhead)) };
}

const ms = (v: Date | string) => (v instanceof Date ? v.getTime() : Date.parse(v));

/** Active appointments overlapping [start, end), with the buffer kept on both sides. */
export function overlapping(busy: Busy[], startMs: number, endMs: number, bufferMinutes: number): number {
  const buf = bufferMinutes * MIN;
  let n = 0;
  for (const b of busy) if (ms(b.start) < endMs + buf && ms(b.end) + buf > startMs) n++;
  return n;
}

export function slotsForDay(args: {
  date: string;
  rules: BookingRules;
  overrides: DateOverride[];
  durationMinutes: number;
  busy: Busy[];
  now: Date;
}): Slot[] {
  const { date, rules, durationMinutes, now } = args;
  if (!isDate(date)) return [];
  const { first, last } = bookingWindow(rules, now);
  if (date < first || date > last) return [];
  const tz = rules.timezone;
  const step = Math.max(5, rules.slotIntervalMinutes);
  const cap = Math.max(1, rules.capacityPerSlot);
  const earliest = now.getTime() + Math.max(0, rules.minNoticeMinutes) * MIN;

  if (rules.dailyLimit) {
    const dayCount = args.busy.filter((b) => localDate(new Date(ms(b.start)), tz) === date).length;
    if (dayCount >= rules.dailyLimit) return [];
  }

  const out: Slot[] = [];
  const seen = new Set<string>();
  for (const [a, b] of rangesFor(date, rules.weeklyHours, args.overrides)) {
    const end = toMinutes(b);
    for (let m = toMinutes(a); m + durationMinutes <= end; m += step) {
      const time = fromMinutes(m);
      if (seen.has(time)) continue; // overlapping ranges typed twice
      const start = zonedTime(date, time, tz);
      const startMs = start.getTime();
      if (startMs < earliest) continue;
      const endMs = startMs + durationMinutes * MIN;
      const taken = overlapping(args.busy, startMs, endMs, rules.bufferMinutes);
      if (taken >= cap) continue;
      seen.add(time);
      out.push({ start: start.toISOString(), end: new Date(endMs).toISOString(), time, left: cap - taken });
    }
  }
  return out.sort((x, y) => x.start.localeCompare(y.start));
}

/** Every day in the window (or `days` days from `fromDate`) with its free slots. */
export function availability(args: {
  rules: BookingRules;
  overrides: DateOverride[];
  durationMinutes: number;
  busy: Busy[];
  now: Date;
  fromDate?: string;
  days?: number;
}): DaySlots[] {
  const { first, last } = bookingWindow(args.rules, args.now);
  const from = args.fromDate && isDate(args.fromDate) && args.fromDate > first ? args.fromDate : first;
  const out: DaySlots[] = [];
  for (let d = from, i = 0; d <= last && i < (args.days ?? 400); d = addDays(d, 1), i++) {
    out.push({ date: d, slots: slotsForDay({ ...args, date: d }) });
  }
  return out;
}

/** The slot that starts exactly at `startIso`, if it is still free. Used to accept a booking. */
export function findSlot(args: {
  startIso: string;
  rules: BookingRules;
  overrides: DateOverride[];
  durationMinutes: number;
  busy: Busy[];
  now: Date;
}): Slot | null {
  const t = Date.parse(args.startIso);
  if (!Number.isFinite(t)) return null;
  const date = localDate(new Date(t), args.rules.timezone);
  const iso = new Date(t).toISOString();
  return slotsForDay({ ...args, date }).find((s) => s.start === iso) ?? null;
}

/** "10:30" → "10:30 am" (India-style 12-hour clock). */
export function time12(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  return `${h % 12 || 12}${m === "00" ? "" : `:${m}`} ${h < 12 ? "am" : "pm"}`;
}

/** "Tue 18 Nov" for a YYYY-MM-DD date. */
export function dayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(date + "T00:00:00Z"));
}

/** Short summary for the model: the next few days that have room, with their first times. */
export function summarizeAvailability(days: DaySlots[], maxDays = 3, maxTimes = 6): { date: string; day: string; times: string[]; more: number }[] {
  return days
    .filter((d) => d.slots.length)
    .slice(0, maxDays)
    .map((d) => ({ date: d.date, day: dayLabel(d.date), times: d.slots.slice(0, maxTimes).map((s) => time12(s.time)), more: Math.max(0, d.slots.length - maxTimes) }));
}

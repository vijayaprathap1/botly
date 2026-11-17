import { z } from "zod";
import { DAYS } from "../hours";
import { isDate, isTime, toMinutes, type TimeRange, type WeeklyHours } from "./slots";
import { publicKey, visitorId } from "../validation/schemas";

const optionalText = (max: number) => z.string().max(max).nullish();

/** GET /api/widget/booking */
export const bookingQuerySchema = z.object({
  key: publicKey,
  testToken: optionalText(200),
  service: z.string().max(64).nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

/** POST /api/widget/booking */
export const bookingRequestSchema = z.object({
  key: publicKey,
  visitorId,
  testToken: optionalText(200),
  conversationId: z.string().uuid().nullish(),
  serviceId: z.string().min(1).max(64),
  start: z.string().min(10).max(40),
  name: z.string().trim().min(2, "Please enter your name.").max(80),
  phone: z.string().trim().min(5, "Please enter a phone number.").max(40),
  email: z.string().trim().max(200).nullish(),
  notes: z.string().trim().max(500).nullish(),
  pageUrl: optionalText(2000),
  pageTitle: optionalText(500),
});

/** Validate and normalise weekly hours from the dashboard (JSON: { mon: [["10:00","13:00"], …], … }). */
export function parseWeeklyHours(raw: unknown): WeeklyHours | string {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return "Weekly hours could not be read. Reload the page and try again.";
    }
  }
  if (!v || typeof v !== "object") return "Weekly hours could not be read.";
  const out: WeeklyHours = {};
  for (const d of DAYS) {
    const ranges = (v as Record<string, unknown>)[d];
    const r = parseRanges(ranges, d);
    if (typeof r === "string") return r;
    out[d] = r;
  }
  return out;
}

const DAY_NAME: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

/** A list of [start, end] times: valid, end after start, no overlaps, at most 6. Sorted. */
export function parseRanges(raw: unknown, label = "this day"): TimeRange[] | string {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return `Hours for ${DAY_NAME[label] ?? label} could not be read.`;
  if (raw.length > 6) return `${DAY_NAME[label] ?? label}: up to 6 time ranges.`;
  const out: TimeRange[] = [];
  for (const r of raw) {
    if (!Array.isArray(r) || !isTime(r[0]) || !isTime(r[1])) return `${DAY_NAME[label] ?? label}: use times like 10:00 and 13:00.`;
    if (toMinutes(r[0]) >= toMinutes(r[1])) return `${DAY_NAME[label] ?? label}: each closing time must be after its opening time.`;
    out.push([r[0], r[1]]);
  }
  out.sort((a, b) => toMinutes(a[0]) - toMinutes(b[0]));
  for (let i = 1; i < out.length; i++) {
    if (toMinutes(out[i]![0]) < toMinutes(out[i - 1]![1])) return `${DAY_NAME[label] ?? label}: time ranges overlap. Leave a gap for a break.`;
  }
  return out;
}

const int = (min: number, max: number, msg: string) => z.coerce.number({ message: msg }).int(msg).min(min, msg).max(max, msg);

export const settingsFormSchema = z.object({
  title: z.string().trim().min(2, "Button text needs at least 2 characters.").max(60, "Button text: 60 characters at most."),
  slot_interval_minutes: int(5, 240, "Start times every: 5 to 240 minutes."),
  buffer_minutes: int(0, 240, "Gap between appointments: 0 to 240 minutes."),
  min_notice_minutes: int(0, 20160, "Minimum notice: 0 minutes to 14 days."),
  max_days_ahead: int(1, 180, "Book up to: 1 to 180 days ahead."),
  capacity_per_slot: int(1, 50, "People at the same time: 1 to 50."),
  daily_limit: z.preprocess((v) => (v === "" || v == null ? null : v), int(1, 1000, "Daily limit: 1 to 1,000, or leave empty.").nullable()),
  confirmation_mode: z.enum(["auto", "manual"]),
  collect_email: z.enum(["off", "optional", "required"]),
  instructions: z.string().trim().max(500, "Instructions: 500 characters at most.").transform((s) => s || null),
  cancellation_policy: z.string().trim().max(300, "Cancellation policy: 300 characters at most.").transform((s) => s || null),
  notify_customer: z.boolean(),
  timezone: z.string().trim().min(3).max(64).refine(isTimeZone, "Unknown timezone."),
});

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export const serviceFormSchema = z.object({
  name: z.string().trim().min(2, "Service name needs at least 2 characters.").max(80, "Service name: 80 characters at most."),
  description: z.string().trim().max(300, "Description: 300 characters at most.").transform((s) => s || null),
  duration_minutes: int(5, 480, "Duration: 5 to 480 minutes."),
  price_inr: z.preprocess((v) => (v === "" || v == null ? null : v), int(0, 10_000_000, "Price: a whole number of rupees, or leave empty.").nullable()),
});

export const overrideFormSchema = z
  .object({
    date: z.string().refine(isDate, "Pick a date."),
    closed: z.boolean(),
    hours: z.unknown(),
    note: z.string().trim().max(120, "Note: 120 characters at most.").transform((s) => s || null),
  })
  .transform((v, ctx) => {
    const hours = v.closed ? [] : parseRanges(typeof v.hours === "string" ? safeJson(v.hours) : v.hours, v.date);
    if (typeof hours === "string") {
      ctx.addIssue({ code: "custom", message: hours });
      return z.NEVER;
    }
    if (!v.closed && !hours.length) {
      ctx.addIssue({ code: "custom", message: "Add the special hours, or mark the day closed." });
      return z.NEVER;
    }
    return { date: v.date, closed: v.closed, hours, note: v.note };
  });

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

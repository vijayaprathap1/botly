import type { BookingRules, DateOverride, TimeRange, WeeklyHours } from "./slots";

/** Rows of migration 0016. */
export type BookingSettingsRow = {
  bot_id: string;
  enabled: boolean;
  title: string;
  timezone: string;
  slot_interval_minutes: number;
  buffer_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  capacity_per_slot: number;
  daily_limit: number | null;
  confirmation_mode: "auto" | "manual";
  collect_email: "off" | "optional" | "required";
  weekly_hours: WeeklyHours;
  instructions: string | null;
  cancellation_policy: string | null;
  notify_customer: boolean;
  updated_at?: string;
};

export type BookingServiceRow = {
  id: string;
  bot_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_inr: number | null;
  active: boolean;
  sort: number;
};

export type DateOverrideRow = { id: string; bot_id: string; date: string; closed: boolean; hours: TimeRange[]; note: string | null };

export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed";
export type AppointmentRow = {
  id: string;
  created_at: string;
  bot_id: string;
  service_id: string | null;
  service_name: string;
  duration_minutes: number;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  notes: string | null;
  conversation_id: string | null;
  visitor_id: string | null;
  source: "widget" | "chat" | "dashboard";
  is_test: boolean;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  completed_at: string | null;
};

/** Defaults for an assistant that has never saved booking settings (booking OFF). */
export const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  mon: [["10:00", "13:00"], ["14:00", "19:00"]],
  tue: [["10:00", "13:00"], ["14:00", "19:00"]],
  wed: [["10:00", "13:00"], ["14:00", "19:00"]],
  thu: [["10:00", "13:00"], ["14:00", "19:00"]],
  fri: [["10:00", "13:00"], ["14:00", "19:00"]],
  sat: [["10:00", "13:00"], ["14:00", "19:00"]],
  sun: [],
};

export function defaultSettings(botId: string, timezone = "Asia/Kolkata"): BookingSettingsRow {
  return {
    bot_id: botId,
    enabled: false,
    title: "Book an appointment",
    timezone,
    slot_interval_minutes: 30,
    buffer_minutes: 0,
    min_notice_minutes: 60,
    max_days_ahead: 30,
    capacity_per_slot: 1,
    daily_limit: null,
    confirmation_mode: "auto",
    collect_email: "optional",
    weekly_hours: DEFAULT_WEEKLY_HOURS,
    instructions: null,
    cancellation_policy: null,
    notify_customer: true,
  };
}

export function rulesFrom(s: BookingSettingsRow): BookingRules {
  return {
    timezone: s.timezone || "Asia/Kolkata",
    slotIntervalMinutes: s.slot_interval_minutes,
    bufferMinutes: s.buffer_minutes,
    minNoticeMinutes: s.min_notice_minutes,
    maxDaysAhead: s.max_days_ahead,
    capacityPerSlot: s.capacity_per_slot,
    dailyLimit: s.daily_limit,
    weeklyHours: s.weekly_hours ?? {},
  };
}

export const overridesFrom = (rows: DateOverrideRow[]): DateOverride[] =>
  rows.map((r) => ({ date: String(r.date).slice(0, 10), closed: r.closed, hours: Array.isArray(r.hours) ? r.hours : [], note: r.note }));

/** Public shape of a service for the widget. */
export type PublicService = { id: string; name: string; description: string | null; duration: number; price: number | null };
export const publicService = (s: BookingServiceRow): PublicService => ({ id: s.id, name: s.name, description: s.description, duration: s.duration_minutes, price: s.price_inr });

/**
 * An assistant with booking on but no services yet still takes bookings: one generic
 * "Appointment" of one slot length, so turning booking on is enough for a single doctor.
 */
export function effectiveServices(rows: BookingServiceRow[], settings: BookingSettingsRow): BookingServiceRow[] {
  const active = rows.filter((s) => s.active).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  if (active.length) return active;
  return [{ id: "default", bot_id: settings.bot_id, name: "Appointment", description: null, duration_minutes: settings.slot_interval_minutes, price_inr: null, active: true, sort: 0 }];
}

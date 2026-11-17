/**
 * The public booking endpoints (GET slots, POST a booking), written against small interfaces
 * so the tests can run them without a database. app/api/widget/booking/route.ts wires them.
 *
 * Every call checks, in order: valid input → known bot → the page is on the bot's allowed
 * domains (same resolveAccess as chat) → rate limits → the plan includes booking and the
 * owner switched it on. Anything else answers "not available" and the widget shows nothing.
 */
import { resolveAccess } from "../chat/access";
import type { ChatStore } from "../chat/store";
import { checkLimits, type RateLimiter } from "../security/rate-limit";
import { isValidEmail, normalizePhone } from "../validation/phone";
import { bookingAllowed, checkSlot, pickService, serviceAvailability, type BookingSource, type CreateResult, type NewAppointment } from "./service";
import { whenLabel } from "./notify";
import { publicService, effectiveServices, type AppointmentRow, type BookingSettingsRow } from "./types";
import { bookingQuerySchema, bookingRequestSchema } from "./validate";
import type { BotWithOrg } from "../types";

export type BookingApiDeps = {
  store: Pick<ChatStore, "getBotByKey" | "getConversation" | "insertMessage" | "touchConversation">;
  source: BookingSource;
  limiter: RateLimiter;
  insert: (row: NewAppointment) => Promise<CreateResult>;
  /** Runs after the response (emails). */
  notify?: (a: AppointmentRow, bot: BotWithOrg, s: BookingSettingsRow) => Promise<void>;
  now?: () => Date;
};

export type ApiResult = { status: number; body: Record<string, unknown>; jobs?: (() => Promise<void>)[] };

const NOT_AVAILABLE = { ok: false, error: "Booking isn't available right now." };

export async function getBookingSlots(deps: BookingApiDeps, query: Record<string, string | null>, origin: string | null, ip: string | null): Promise<ApiResult> {
  const parsed = bookingQuerySchema.safeParse(query);
  if (!parsed.success) return { status: 400, body: { ok: false, error: "Invalid request" } };
  const q = parsed.data;
  const bot = await deps.store.getBotByKey(q.key);
  if (!bot) return { status: 404, body: NOT_AVAILABLE };
  if (!resolveAccess(bot, origin, q.testToken).allowed) return { status: 403, body: NOT_AVAILABLE };
  if (ip) {
    const r = await deps.limiter.hit(`bkq:${ip}`, 60, 60);
    if (!r.allowed) return { status: 429, body: { ok: false, error: "Too many requests. Please try again in a minute." } };
  }
  const settings = await deps.source.enabledSettings(bot.id);
  if (!bookingAllowed(bot, settings)) return { status: 404, body: NOT_AVAILABLE };

  const now = deps.now?.() ?? new Date();
  const ctx = await deps.source.context(settings, now);
  const services = effectiveServices(ctx.services, settings);
  const service = pickService(ctx, q.service);
  const days = serviceAvailability(ctx, service, now);
  const firstOpen = days.find((d) => d.slots.length)?.date ?? null;
  const date = q.date && days.some((d) => d.date === q.date) ? q.date : firstOpen;
  const day = days.find((d) => d.date === date);
  return {
    status: 200,
    body: {
      ok: true,
      title: settings.title,
      timezone: settings.timezone,
      confirmation: settings.confirmation_mode,
      collectEmail: settings.collect_email,
      instructions: settings.instructions,
      cancellationPolicy: settings.cancellation_policy,
      services: services.map(publicService),
      service: service.id,
      days: days.map((d) => ({ date: d.date, n: d.slots.length })),
      date,
      slots: (day?.slots ?? []).map((s) => ({ start: s.start, t: s.time, left: s.left })),
    },
  };
}

export async function createBooking(deps: BookingApiDeps, raw: unknown, origin: string | null, ip: string | null): Promise<ApiResult> {
  const parsed = bookingRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path?.[0] ?? "");
    return { status: 400, body: { ok: false, field: ["name", "phone", "email", "notes"].includes(field) ? field : undefined, error: field === "name" || field === "phone" ? issue!.message : "Invalid request" } };
  }
  const input = parsed.data;
  const bot = await deps.store.getBotByKey(input.key);
  if (!bot) return { status: 404, body: NOT_AVAILABLE };
  const access = resolveAccess(bot, origin, input.testToken);
  if (!access.allowed) return { status: 403, body: NOT_AVAILABLE };

  const blocked = await checkLimits(deps.limiter, [
    { key: `book:${bot.id}:${input.visitorId}`, limit: 5, windowSeconds: 600, reason: "visitor" },
    ...(ip ? [{ key: `bookip:${ip}`, limit: 15, windowSeconds: 600, reason: "ip" }] : []),
  ]);
  if (blocked) return { status: 429, body: { ok: false, error: "Too many attempts. Please try again in a few minutes." } };

  const settings = await deps.source.enabledSettings(bot.id);
  if (!bookingAllowed(bot, settings)) return { status: 404, body: NOT_AVAILABLE };

  const phone = normalizePhone(input.phone);
  if (!phone.ok) return { status: 422, body: { ok: false, field: "phone", error: phone.error } };
  const email = settings.collect_email === "off" ? null : (input.email ?? "").trim() || null;
  if (settings.collect_email === "required" && !email) return { status: 422, body: { ok: false, field: "email", error: "Please enter your email." } };
  if (email && !isValidEmail(email)) return { status: 422, body: { ok: false, field: "email", error: "That email doesn't look right." } };

  const now = deps.now?.() ?? new Date();
  const ctx = await deps.source.context(settings, now);
  const services = effectiveServices(ctx.services, settings);
  const service = services.find((s) => s.id === input.serviceId);
  if (!service) return { status: 422, body: { ok: false, field: "service", error: "That service isn't available any more. Please pick another." } };
  const slot = checkSlot(ctx, service, input.start, now);
  if (!slot) return { status: 409, body: { ok: false, code: "taken", error: "That time is no longer free. Please pick another time." } };

  // Link to the visitor's chat when it's theirs, so the owner sees the transcript.
  let conversationId: string | null = null;
  if (input.conversationId) {
    const c = await deps.store.getConversation(input.conversationId);
    if (c && c.bot_id === bot.id && c.visitor_id === input.visitorId) conversationId = c.id;
  }
  const auto = settings.confirmation_mode === "auto";
  const created = await deps.insert({
    bot_id: bot.id,
    service_id: service.id === "default" ? null : service.id,
    service_name: service.name,
    duration_minutes: service.duration_minutes,
    start_at: slot.start,
    end_at: slot.end,
    status: auto ? "confirmed" : "pending",
    confirmed_at: auto ? now.toISOString() : null,
    customer_name: input.name.replace(/\s+/g, " ").trim(),
    customer_phone: phone.e164,
    customer_email: email,
    notes: (input.notes ?? "").replace(/\s+/g, " ").trim() || null,
    conversation_id: conversationId,
    visitor_id: input.visitorId,
    source: conversationId ? "chat" : "widget",
    is_test: access.isTest,
  });
  if (!created.ok) {
    if (created.reason === "full") return { status: 409, body: { ok: false, code: "taken", error: "Someone just booked that time. Please pick another." } };
    if (created.reason === "duplicate") return { status: 409, body: { ok: false, code: "duplicate", error: "You already have this time booked." } };
    throw new Error(`booking insert failed: ${created.message ?? "unknown"}`);
  }
  const a = created.appointment;
  const when = whenLabel(a.start_at, settings.timezone);
  if (conversationId) {
    await deps.store.insertMessage({
      conversation_id: conversationId,
      role: "system_event",
      content: `${auto ? "Booked" : "Booking requested"}: ${a.service_name}, ${when} (${a.customer_name}).`,
    });
    await deps.store.touchConversation(conversationId, 1, null);
  }
  const jobs = deps.notify ? [() => deps.notify!(a, bot, settings)] : [];
  return {
    status: 200,
    body: {
      ok: true,
      booking: { id: a.id, status: a.status, service: a.service_name, start: a.start_at, when, duration: a.duration_minutes, name: a.customer_name, phone: phone.display },
      instructions: settings.instructions,
    },
    jobs,
  };
}

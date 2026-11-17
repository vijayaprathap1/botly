import { beforeEach, describe, expect, it } from "vitest";
import { createBooking, getBookingSlots, type BookingApiDeps } from "@/lib/booking/api";
import type { BookingContext, BookingSource, CreateResult, NewAppointment } from "@/lib/booking/service";
import { bookingAllowed } from "@/lib/booking/service";
import { renderBusinessBookingEmail, renderCustomerBookingEmail } from "@/lib/booking/notify";
import { zonedTime } from "@/lib/booking/slots";
import { defaultSettings, type AppointmentRow, type BookingServiceRow, type BookingSettingsRow } from "@/lib/booking/types";
import { parseRanges, parseWeeklyHours, overrideFormSchema, serviceFormSchema, settingsFormSchema } from "@/lib/booking/validate";
import { runChat, type ChatEventName, type EngineDeps } from "@/lib/chat/engine";
import { MemoryStore } from "@/lib/chat/memory-store";
import { toolsForPlan } from "@/lib/chat/tools";
import { fixtureToBot, loadEvalFile } from "@/lib/eval/fixture";
import type { LlmClient, LlmRequest, LlmTurn, ToolUsePart } from "@/lib/llm/types";
import { bookingPlan, hasBooking, plans } from "@/lib/plans";
import { buildSystemPrompt } from "@/lib/prompts/assistant";
import { MemoryRateLimiter } from "@/lib/security/rate-limit";
import type { BotWithOrg } from "@/lib/types";

const fixture = loadEvalFile("evals/ananya-handlooms.yaml").fixture!;
const NOW = new Date("2026-11-17T03:30:00Z"); // Tue 09:00 IST
const ORIGIN = "https://ananya.in";
const ist = (d: string, t: string) => zonedTime(d, t, "Asia/Kolkata").toISOString();

class FakeSource implements BookingSource {
  settings: BookingSettingsRow | null;
  services: BookingServiceRow[] = [];
  busy: { start: string; end: string }[] = [];
  constructor(s: Partial<BookingSettingsRow> = {}) {
    this.settings = { ...defaultSettings("x"), enabled: true, min_notice_minutes: 0, ...s };
  }
  async enabledSettings(botId: string) {
    return this.settings?.enabled ? { ...this.settings, bot_id: botId } : null;
  }
  async context(settings: BookingSettingsRow): Promise<BookingContext> {
    return { settings, services: this.services, overrides: [], busy: this.busy };
  }
}

let store: MemoryStore;
let bot: BotWithOrg;
let source: FakeSource;
let inserted: NewAppointment[];
let insertResult: CreateResult | null;
const deps = (): BookingApiDeps => ({
  store,
  source,
  limiter: new MemoryRateLimiter(() => NOW.getTime()),
  now: () => NOW,
  insert: async (row) => {
    inserted.push(row);
    return insertResult ?? { ok: true, appointment: { ...row, id: "a1", created_at: NOW.toISOString(), confirmed_at: row.confirmed_at ?? null, cancelled_at: null, cancel_reason: null, completed_at: null } as AppointmentRow };
  },
  notify: async () => {},
});
const setPlan = (plan: string) => {
  bot = { ...bot, org: { ...bot.org, plan: plan as BotWithOrg["org"]["plan"] } };
  store.bots.clear();
  store.addBot(bot, []);
};
const body = (o: Record<string, unknown> = {}) => ({
  key: bot.public_key,
  visitorId: "visitor-123456",
  serviceId: "default",
  start: ist("2026-11-18", "10:30"),
  name: "Priya Raman",
  phone: "98765 43210",
  ...o,
});

beforeEach(() => {
  store = new MemoryStore();
  const f = fixtureToBot(fixture);
  bot = { ...f.bot, status: "live", active: true, allowed_origins: ["ananya.in"], org: { ...f.bot.org, plan: "starter", suspended: false } } as BotWithOrg;
  store.addBot(bot, []);
  source = new FakeSource();
  inserted = [];
  insertResult = null;
});

describe("plan gating", () => {
  it("booking is on Starter and up and in trials; not on Free", () => {
    expect(hasBooking("free")).toBe(false);
    for (const p of ["trial", "starter", "growth", "pro"]) expect(hasBooking(p)).toBe(true);
    expect(bookingPlan().id).toBe("starter");
    expect(plans().starter.features.join(" ")).toMatch(/Appointment booking/);
    expect(plans().free.features.join(" ")).not.toMatch(/booking/i);
  });
  it("needs the plan, the switch, and an active account", () => {
    const s = { enabled: true };
    expect(bookingAllowed({ org: { ...bot.org, plan: "starter" } }, s)).toBe(true);
    expect(bookingAllowed({ org: { ...bot.org, plan: "free" } }, s)).toBe(false);
    expect(bookingAllowed({ org: { ...bot.org, plan: "starter" } }, { enabled: false })).toBe(false);
    expect(bookingAllowed({ org: { ...bot.org, plan: "starter" } }, null)).toBe(false);
    expect(bookingAllowed({ org: { ...bot.org, plan: "pro", suspended: true } }, s)).toBe(false);
  });
  it("tools: show_booking only when booking is on; it replaces request_callback on Growth", () => {
    const names = (p: Parameters<typeof toolsForPlan>[0], booking?: boolean) => toolsForPlan(p, { booking }).map((t) => t.name);
    expect(names("starter")).not.toContain("show_booking");
    expect(names("starter", true)).toContain("show_booking");
    expect(names("growth")).toContain("request_callback");
    expect(names("growth", true)).toEqual(expect.arrayContaining(["show_booking", "lookup_order"]));
    expect(names("growth", true)).not.toContain("request_callback");
  });
  it("prompt: unchanged without booking; booking rule added when on", () => {
    const input: Parameters<typeof buildSystemPrompt>[0] = { assistantName: "Asha", businessName: "Sri Sai Clinic", businessType: "clinic", tone: "friendly", growth: true, approvedKnowledge: "", nowInBusinessTimezone: "Tuesday", businessHours: "Mon–Sat 10–7", isOpen: true };
    const plain = JSON.stringify(buildSystemPrompt(input));
    expect(plain).toBe(JSON.stringify(buildSystemPrompt({ ...input, booking: false })));
    expect(plain).toContain("request_callback");
    expect(plain).not.toContain("show_booking");
    const on = JSON.stringify(buildSystemPrompt({ ...input, booking: true }));
    expect(on).toContain("show_booking");
    expect(on).not.toContain("use request_callback");
  });
});

describe("GET /api/widget/booking", () => {
  const q = (o: Record<string, string | null> = {}) => ({ key: bot.public_key, testToken: null, service: null, date: null, ...o });
  it("returns services, days and the first open day's times", async () => {
    const r = await getBookingSlots(deps(), q(), ORIGIN, "1.2.3.4");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, title: "Book an appointment", service: "default", date: "2026-11-17" });
    const slots = r.body.slots as { t: string }[];
    expect(slots[0]!.t).toBe("10:00");
    expect((r.body.services as unknown[]).length).toBe(1);
  });
  it("a chosen date returns that day; Sunday has none", async () => {
    const r = await getBookingSlots(deps(), q({ date: "2026-11-22" }), ORIGIN, null);
    expect(r.body.date).toBe("2026-11-22");
    expect(r.body.slots).toEqual([]);
  });
  it("Free plan → 404 even when switched on", async () => {
    setPlan("free");
    expect((await getBookingSlots(deps(), q(), ORIGIN, null)).status).toBe(404);
  });
  it("switched off → 404", async () => {
    source.settings!.enabled = false;
    expect((await getBookingSlots(deps(), q(), ORIGIN, null)).status).toBe(404);
  });
  it("other website → 403; test token works anywhere; bad input 400; unknown key 404", async () => {
    expect((await getBookingSlots(deps(), q(), "https://evil.com", null)).status).toBe(403);
    expect((await getBookingSlots(deps(), q({ testToken: bot.test_token }), null, null)).status).toBe(200);
    expect((await getBookingSlots(deps(), q({ date: "18-11-2026" }), ORIGIN, null)).status).toBe(400);
    expect((await getBookingSlots(deps(), q({ key: "nope_nope_nope" }), ORIGIN, null)).status).toBe(404);
  });
  it("rate limited per IP", async () => {
    const d = deps();
    for (let i = 0; i < 60; i++) await getBookingSlots(d, q(), ORIGIN, "9.9.9.9");
    expect((await getBookingSlots(d, q(), ORIGIN, "9.9.9.9")).status).toBe(429);
  });
});

describe("POST /api/widget/booking", () => {
  it("auto-confirm: saves a confirmed booking with a normalised phone", async () => {
    const r = await createBooking(deps(), body(), ORIGIN, "1.2.3.4");
    expect(r.status).toBe(200);
    expect(inserted[0]).toMatchObject({ status: "confirmed", customer_phone: "+919876543210", service_name: "Appointment", service_id: null, start_at: ist("2026-11-18", "10:30"), is_test: false, source: "widget" });
    expect((r.body.booking as { status: string }).status).toBe("confirmed");
    expect(r.jobs).toHaveLength(1);
  });
  it("manual mode: saves as pending", async () => {
    source.settings!.confirmation_mode = "manual";
    await createBooking(deps(), body(), ORIGIN, null);
    expect(inserted[0]!.status).toBe("pending");
    expect(inserted[0]!.confirmed_at).toBeNull();
  });
  it("validation: name, phone, email by setting", async () => {
    expect((await createBooking(deps(), body({ name: "P" }), ORIGIN, null)).body).toMatchObject({ field: "name" });
    expect((await createBooking(deps(), body({ phone: "12345" }), ORIGIN, null)).body).toMatchObject({ field: "phone" });
    source.settings!.collect_email = "required";
    expect((await createBooking(deps(), body(), ORIGIN, null)).body).toMatchObject({ field: "email" });
    expect((await createBooking(deps(), body({ email: "nope" }), ORIGIN, null)).body).toMatchObject({ field: "email" });
    expect((await createBooking(deps(), body({ email: "p@example.com" }), ORIGIN, null)).status).toBe(200);
    source.settings!.collect_email = "off";
    await createBooking(deps(), body({ email: "p@example.com", start: ist("2026-11-18", "11:00") }), ORIGIN, null);
    expect(inserted.at(-1)!.customer_email).toBeNull();
    expect((await createBooking(deps(), { ...body(), visitorId: "x" }, ORIGIN, null)).status).toBe(400);
  });
  it("a time that isn't offered or is taken → 409 taken; never inserts", async () => {
    expect((await createBooking(deps(), body({ start: ist("2026-11-18", "13:30") }), ORIGIN, null)).body).toMatchObject({ code: "taken" });
    expect((await createBooking(deps(), body({ start: ist("2026-11-16", "10:30") }), ORIGIN, null)).status).toBe(409);
    source.busy = [{ start: ist("2026-11-18", "10:30"), end: ist("2026-11-18", "11:00") }];
    expect((await createBooking(deps(), body(), ORIGIN, null)).status).toBe(409);
    expect(inserted).toHaveLength(0);
  });
  it("the database guard (race) and duplicate are reported as 409", async () => {
    insertResult = { ok: false, reason: "full" };
    expect((await createBooking(deps(), body(), ORIGIN, null)).body).toMatchObject({ code: "taken" });
    insertResult = { ok: false, reason: "duplicate" };
    expect((await createBooking(deps(), body(), ORIGIN, null)).body).toMatchObject({ code: "duplicate" });
  });
  it("unknown service → 422; a real service uses its own length", async () => {
    expect((await createBooking(deps(), body({ serviceId: "nope" }), ORIGIN, null)).status).toBe(422);
    source.services = [{ id: "svc1", bot_id: bot.id, name: "Root canal", description: null, duration_minutes: 60, price_inr: 3000, active: true, sort: 0 } as BookingServiceRow];
    await createBooking(deps(), body({ serviceId: "svc1" }), ORIGIN, null);
    expect(inserted[0]).toMatchObject({ service_id: "svc1", service_name: "Root canal", duration_minutes: 60, end_at: ist("2026-11-18", "11:30") });
  });
  it("gating and access: Free 404, off 404, other site 403, test link marks is_test", async () => {
    expect((await createBooking(deps(), body(), "https://evil.com", null)).status).toBe(403);
    await createBooking(deps(), body({ testToken: bot.test_token }), null, null);
    expect(inserted[0]!.is_test).toBe(true);
    source.settings!.enabled = false;
    expect((await createBooking(deps(), body(), ORIGIN, null)).status).toBe(404);
    source.settings!.enabled = true;
    setPlan("free");
    expect((await createBooking(deps(), body(), ORIGIN, null)).status).toBe(404);
  });
  it("links the visitor's own conversation and notes it there; ignores someone else's", async () => {
    const cid = (await store.beginConversation({ botId: bot.id, visitorId: "visitor-123456", isTest: false, quota: 100, month: "2026-11", pageUrl: null, pageTitle: null, language: null } as never))!;
    await createBooking(deps(), body({ conversationId: cid }), ORIGIN, null);
    expect(inserted[0]).toMatchObject({ conversation_id: cid, source: "chat" });
    expect(store.messages.at(-1)).toMatchObject({ role: "system_event" });
    expect(store.messages.at(-1)!.content).toMatch(/^Booked: Appointment, Wed,? 18 Nov.*10:30 am \(Priya Raman\)/);
    await createBooking(deps(), { ...body({ conversationId: cid, start: ist("2026-11-18", "11:00") }), visitorId: "someone-else-1" }, ORIGIN, null);
    expect(inserted[1]!.conversation_id).toBeNull();
  });
  it("visitor rate limit: 5 attempts per 10 minutes", async () => {
    const d = deps();
    for (let i = 0; i < 5; i++) await createBooking(d, body({ name: "P" }), ORIGIN, null);
    // invalid bodies don't count; now 5 real attempts then a 6th
    for (let i = 0; i < 5; i++) await createBooking(d, body({ start: ist("2026-11-18", "13:30") }), ORIGIN, null);
    expect((await createBooking(d, body(), ORIGIN, null)).status).toBe(429);
  });
});

describe("dashboard validation", () => {
  it("weekly hours: sorted, no overlaps, end after start", () => {
    expect(parseWeeklyHours(JSON.stringify({ mon: [["14:00", "19:00"], ["10:00", "13:00"]] }))).toMatchObject({ mon: [["10:00", "13:00"], ["14:00", "19:00"]], sun: [] });
    expect(typeof parseWeeklyHours(JSON.stringify({ mon: [["10:00", "13:00"], ["12:00", "15:00"]] }))).toBe("string");
    expect(typeof parseWeeklyHours(JSON.stringify({ tue: [["13:00", "10:00"]] }))).toBe("string");
    expect(typeof parseWeeklyHours("{bad")).toBe("string");
    expect(typeof parseRanges(Array(7).fill(["10:00", "11:00"]))).toBe("string");
  });
  it("settings, service and override forms", () => {
    const ok = settingsFormSchema.safeParse({ title: "Book a visit", slot_interval_minutes: "30", buffer_minutes: "10", min_notice_minutes: "60", max_days_ahead: "30", capacity_per_slot: "2", daily_limit: "", confirmation_mode: "manual", collect_email: "optional", instructions: "", cancellation_policy: "", notify_customer: true, timezone: "Asia/Kolkata" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toMatchObject({ slot_interval_minutes: 30, capacity_per_slot: 2, daily_limit: null, instructions: null });
    expect(settingsFormSchema.safeParse({ ...(ok.success ? ok.data : {}), timezone: "Mars/Base" }).success).toBe(false);
    expect(settingsFormSchema.safeParse({ ...(ok.success ? ok.data : {}), slot_interval_minutes: "2" }).success).toBe(false);
    expect(serviceFormSchema.safeParse({ name: "Haircut", description: "", duration_minutes: "45", price_inr: "" }).success).toBe(true);
    expect(serviceFormSchema.safeParse({ name: "Haircut", description: "", duration_minutes: "0", price_inr: "" }).success).toBe(false);
    expect(overrideFormSchema.safeParse({ date: "2026-12-25", closed: true, hours: "[]", note: "Christmas" }).success).toBe(true);
    expect(overrideFormSchema.safeParse({ date: "2026-12-25", closed: false, hours: "[]", note: "" }).success).toBe(false);
  });
});

describe("emails", () => {
  const appt = { id: "a1", bot_id: "b", service_id: null, service_name: "General consultation", duration_minutes: 20, start_at: ist("2026-11-18", "10:30"), end_at: ist("2026-11-18", "10:50"), status: "confirmed", customer_name: "Priya <b>Raman</b>", customer_phone: "+919876543210", customer_email: "p@example.com", notes: null, conversation_id: null, visitor_id: null, source: "widget", is_test: false } as unknown as AppointmentRow;
  it("business email names the time in IST and escapes customer text", () => {
    const e = renderBusinessBookingEmail(appt, bot, defaultSettings("b"));
    expect(e.subject).toMatch(/Priya/);
    expect(e.html).toContain("10:30 am");
    expect(e.html).not.toContain("<b>Raman</b>");
  });
  it("customer emails: received (manual), confirmed, cancelled", () => {
    expect(renderCustomerBookingEmail("received", { ...appt, status: "pending" }, bot, defaultSettings("b")).subject).toMatch(/request/i);
    expect(renderCustomerBookingEmail("confirmed", appt, bot, defaultSettings("b")).subject).toMatch(/confirmed/i);
    expect(renderCustomerBookingEmail("cancelled", appt, bot, defaultSettings("b")).subject).toMatch(/cancel/i);
  });
});

describe("chat: show_booking", () => {
  class QueueLlm implements LlmClient {
    calls: LlmRequest[] = [];
    constructor(private turns: Array<{ text?: string; tools?: Array<{ name: string; input: Record<string, unknown> }> }>) {}
    async stream(req: LlmRequest, onText: (t: string) => void): Promise<LlmTurn> {
      this.calls.push(structuredClone(req));
      const t = this.turns.shift() ?? { text: "ok" };
      const content: LlmTurn["content"] = [];
      if (t.text) (onText(t.text), content.push({ type: "text", text: t.text }));
      for (const tool of t.tools ?? []) content.push({ type: "tool_use", id: "tu_1", name: tool.name, input: tool.input } as ToolUsePart);
      return { content, stopReason: t.tools?.length ? "tool_use" : "end_turn", usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, firstTokenMs: 1 };
    }
  }
  const events: Array<{ event: ChatEventName; data: any }> = [];
  const run = async (llm: QueueLlm, src?: BookingSource) => {
    events.length = 0;
    const d: EngineDeps = { store, llm, limiter: new MemoryRateLimiter(), notifiers: [], booking: src, now: () => NOW } as EngineDeps;
    await runChat(d, { key: bot.public_key, visitorId: "visitor-123456", message: "Can I see the doctor tomorrow?", pageUrl: "https://ananya.in/", pageTitle: "Home" }, { origin: ORIGIN, ip: "1.2.3.4", debug: true }, (event, data) => events.push({ event, data }));
  };
  it("shows the booking card and gives the model real free times", async () => {
    const llm = new QueueLlm([{ tools: [{ name: "show_booking", input: { date: "2026-11-18" } }] }, { text: "Tomorrow 10 am is free. Pick a time in the card." }]);
    await run(llm, source);
    expect(llm.calls[0]!.tools!.map((t) => t.name)).toContain("show_booking");
    expect(events.find((e) => e.event === "tool_card")?.data).toMatchObject({ type: "booking", service: "default", date: "2026-11-18" });
    const toolResult = JSON.stringify(llm.calls[1]!.messages.at(-1));
    expect(toolResult).toContain("10 am");
    expect(toolResult).toContain("card_shown");
  });
  it("no booking tool when switched off or on Free", async () => {
    source.settings!.enabled = false;
    const llm = new QueueLlm([{ text: "Please call us." }]);
    await run(llm, source);
    expect(llm.calls[0]!.tools!.map((t) => t.name)).not.toContain("show_booking");
    source.settings!.enabled = true;
    setPlan("free");
    const llm2 = new QueueLlm([{ text: "Please call us." }]);
    await run(llm2, source);
    expect(llm2.calls[0]!.tools!.map((t) => t.name)).not.toContain("show_booking");
  });
});

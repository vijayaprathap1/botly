import { after } from "next/server";
import { resolveAccess } from "@/lib/chat/access";
import { serverDeps } from "@/lib/chat/deps";
import { saveLead } from "@/lib/chat/leads";
import { clientIp, json, preflight, readJsonBody } from "@/lib/http";
import { effectiveQuota, monthKey } from "@/lib/quota";
import { checkLimits } from "@/lib/security/rate-limit";
import { detectLanguage } from "@/lib/language";
import { leadRequestSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Lead form in the widget: "Talk to a person" and the form the model asks for. */
export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[api/widget/lead]", e instanceof Error ? e.message : e);
    return json(req, { ok: false, error: "Couldn't send right now. Please try again in a minute." }, 503);
  }
}

async function handle(req: Request) {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(req, { ok: false, error: "Invalid request" }, 400);
  }
  const parsed = leadRequestSchema.safeParse(body);
  if (!parsed.success) return json(req, { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
  const input = parsed.data;

  const deps = serverDeps();
  const bot = await deps.store.getBotByKey(input.key);
  if (!bot) return json(req, { ok: false, error: "Not available" }, 404);
  const access = resolveAccess(bot, req.headers.get("origin"), input.testToken);
  if (!access.allowed) return json(req, { ok: false, error: "Not available" }, 403);

  const ip = clientIp(req);
  const blocked = await checkLimits(deps.limiter, [
    { key: `lead:${bot.id}:${input.visitorId}`, limit: 5, windowSeconds: 600, reason: "visitor" },
    ...(ip ? [{ key: `leadip:${ip}`, limit: 15, windowSeconds: 600, reason: "ip" }] : []),
  ]);
  if (blocked) return json(req, { ok: false, error: "Too many attempts. Please try again in a few minutes." }, 429);

  // Use the visitor's current conversation, or start one so the lead has a transcript.
  let conversationId: string | null = null;
  if (input.conversationId) {
    const c = await deps.store.getConversation(input.conversationId);
    if (c && c.bot_id === bot.id && c.visitor_id === input.visitorId) conversationId = c.id;
  }
  if (!conversationId) {
    const month = monthKey(new Date(), bot.org.timezone);
    conversationId = await deps.store.beginConversation({
      botId: bot.id,
      visitorId: input.visitorId,
      pageUrl: input.pageUrl ?? null,
      pageTitle: input.pageTitle ?? null,
      language: input.need ? detectLanguage(input.need) : null,
      month,
      quota: effectiveQuota(bot.org.monthly_conversation_quota, bot.monthly_conversation_quota),
      isTest: access.isTest,
    });
    // At quota the lead is still saved (without a conversation). Leads are never dropped.
  }

  const handoff = input.type === "human";
  if (input.type === "callback") {
    if (bot.org.plan !== "growth") return json(req, { ok: false, error: "Not available" }, 403);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: bot.org.timezone }).format(new Date());
    if (!input.preferredDate || input.preferredDate < today) return json(req, { ok: false, field: "date", error: "Please pick today or a later date." }, 422);
  }
  const result = await saveLead({
    store: deps.store,
    notifiers: deps.notifiers,
    bot,
    conversationId,
    input: {
      name: input.name,
      phone: input.phone,
      email: input.email,
      need: input.need,
      type: input.type,
      preferred_time: input.type === "callback" && input.preferredDate ? `${input.preferredDate}, ${input.preferredSlot || "any time"}` : null,
    },
    handoff,
    isTest: access.isTest,
    pageTitle: input.pageTitle,
  });
  if (!result.ok) return json(req, { ok: false, field: result.field, error: result.error }, 422);

  if (conversationId) {
    await deps.store.insertMessage({
      conversation_id: conversationId,
      role: "system_event",
      content: handoff
        ? `Visitor asked to talk to a person and left their details (${result.lead.name}).`
        : input.type === "callback"
          ? `Visitor booked a callback for ${result.lead.preferred_time} (${result.lead.name}).`
          : `Visitor left their details (${result.lead.name}).`,
    });
    await deps.store.touchConversation(conversationId, 1, null);
  }
  if (result.notify) {
    const notify = result.notify;
    after(() => notify().catch((e) => console.error("[api/widget/lead] notify", e)));
  }
  return json(req, { ok: true, conversationId, name: result.lead.name });
}

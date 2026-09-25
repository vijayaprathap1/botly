import { config } from "../config";
import { addUsage, computeCostUsd, emptyUsage, pricingFor, type Usage } from "../cost";
import { formatHours, formatNow, isOpenNow } from "../hours";
import { buildKnowledgeBlock } from "../knowledge";
import type { Retriever } from "../retrieval/retriever";
import { toCard, verifyCustomer, type OrderProvider, type OrderStatusCard } from "../orders/types";
import { detectLanguage } from "../language";
import type { LlmClient, LlmMessage, TextPart, ToolResultPart, ToolUsePart } from "../llm/types";
import { dispatchNotice } from "../notify/dispatch";
import type { Notifier } from "../notify/types";
import { buildSystemPrompt } from "../prompts/assistant";
import { effectiveQuota, monthKey, shouldSendQuotaWarning } from "../quota";
import { checkLimits, type RateLimiter } from "../security/rate-limit";
import type { BotWithOrg, ConversationRow, LeadType, ToolCallLog } from "../types";
import { normalizePhone } from "../validation/phone";
import { resolveAccess } from "./access";
import { buildHistory } from "./history";
import { saveLead } from "./leads";
import type { ChatStore } from "./store";
import { TERMINAL_TOOLS, toolsForPlan } from "./tools";

export type ChatRequest = {
  key: string;
  visitorId: string;
  conversationId?: string | null;
  message: string;
  pageUrl?: string | null;
  pageTitle?: string | null;
  testToken?: string | null;
  identity?: { name?: string; phone?: string; email?: string } | null;
};

export type ChatEventName = "meta" | "delta" | "tool_card" | "suggestions" | "debug" | "done" | "error";
export type Emit = (event: ChatEventName, data: unknown) => void;

export type ToolCard =
  | { type: "lead_form"; leadType: LeadType; prefill: { name?: string; phone?: string; email?: string; need?: string }; error?: string }
  | { type: "lead_saved"; name: string; handoff: boolean }
  | { type: "fallback_contact"; reason: "quota" | "inactive" | "error"; contact: BotWithOrg["fallback_contact"] }
  | ({ type: "order_status" } & OrderStatusCard)
  | { type: "callback_form"; prefill: { name?: string; phone?: string; date?: string; slot?: string; need?: string }; minDate: string; error?: string };

export type EngineDeps = {
  store: ChatStore;
  llm: LlmClient;
  limiter: RateLimiter;
  notifiers: Notifier[];
  now?: () => Date;
  /** Phase 2 retrieval mode, used when approved knowledge is over the cap. */
  retriever?: Retriever;
  /** Phase 3 order lookup (Growth plan). */
  orders?: (botId: string) => Promise<OrderProvider | null>;
};

export type EngineContext = { origin: string | null; ip: string | null; debug: boolean };

export type ChatOutcome = {
  jobs: (() => Promise<void>)[];
  conversationId: string | null;
  text: string;
  toolCalls: ToolCallLog[];
  firstTokenMs: number | null;
  latencyMs: number;
  usage: Usage;
  costUsd: number;
  language: string;
};

const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;
const digits = (s: string) => s.replace(/\D/g, "");

/** One visitor message → one streamed assistant reply (with tool rounds). */
export async function runChat(deps: EngineDeps, req: ChatRequest, ctx: EngineContext, emit: Emit): Promise<ChatOutcome> {
  const started = Date.now();
  const now = deps.now?.() ?? new Date();
  const outcome: ChatOutcome = {
    jobs: [],
    conversationId: null,
    text: "",
    toolCalls: [],
    firstTokenMs: null,
    latencyMs: 0,
    usage: emptyUsage(),
    costUsd: 0,
    language: detectLanguage(req.message),
  };
  const fail = (code: string, message: string) => {
    emit("error", { code, message });
    outcome.latencyMs = Date.now() - started;
    return outcome;
  };

  // 1. Bot + access -----------------------------------------------------------------
  const bot = await deps.store.getBotByKey(req.key);
  if (!bot) return fail("not_found", "This chat isn't available.");
  const access = resolveAccess(bot, ctx.origin, req.testToken);
  if (!access.allowed) {
    if (access.reason === "inactive" || access.reason === "not_live") {
      emit("tool_card", { type: "fallback_contact", reason: "inactive", contact: bot.fallback_contact } satisfies ToolCard);
      return fail("inactive", "Chat is not available right now.");
    }
    return fail(access.reason, "This chat isn't available on this website.");
  }
  const isTest = access.isTest;

  // 2. Rate limits ------------------------------------------------------------------
  const blocked = await checkLimits(deps.limiter, [
    { key: `v:${bot.id}:${req.visitorId}`, limit: config.visitorLimitPer10Min, windowSeconds: 600, reason: "visitor" },
    ...(ctx.ip ? [{ key: `ip:${ctx.ip}`, limit: config.visitorLimitPer10Min * 3, windowSeconds: 600, reason: "ip" }] : []),
    { key: `b:${bot.id}`, limit: config.botLimitPerMin, windowSeconds: 60, reason: "bot" },
  ]);
  if (blocked) return fail("rate_limited", "You're sending messages quickly. Please wait a minute and try again.");

  // 2b. Plan gate: free-trial replies and days, suspended accounts ---------------------
  const gate = await deps.store.consumeReply(bot.org.id);
  if (gate !== "ok") {
    emit("tool_card", { type: "fallback_contact", reason: "quota", contact: bot.fallback_contact } satisfies ToolCard);
    emit("done", { conversationId: req.conversationId ?? null, quota: gate === "suspended" ? "suspended" : "trial_ended" });
    return outcome;
  }

  // 3. Conversation (+ quota on the first message) ---------------------------------
  const month = monthKey(now, bot.org.timezone);
  const quota = effectiveQuota(bot.org.monthly_conversation_quota, bot.monthly_conversation_quota);
  let conversation: ConversationRow | null = null;
  if (req.conversationId) {
    const c = await deps.store.getConversation(req.conversationId);
    const fresh = c?.last_message_at && now.getTime() - new Date(c.last_message_at).getTime() < RESTORE_WINDOW_MS;
    if (c && c.bot_id === bot.id && c.visitor_id === req.visitorId && fresh && c.status !== "closed") conversation = c;
  }
  let isNewConversation = false;
  if (!conversation) {
    const id = await deps.store.beginConversation({
      botId: bot.id,
      visitorId: req.visitorId,
      pageUrl: req.pageUrl ?? null,
      pageTitle: req.pageTitle ?? null,
      language: outcome.language,
      month,
      quota,
      isTest,
    });
    if (!id) {
      emit("tool_card", { type: "fallback_contact", reason: "quota", contact: bot.fallback_contact } satisfies ToolCard);
      emit("done", { conversationId: null, quota: "exceeded" });
      return outcome;
    }
    conversation = await deps.store.getConversation(id);
    if (!conversation) return fail("server_error", "Something went wrong. Please try again.");
    isNewConversation = true;
  }
  const conversationId = conversation.id;
  outcome.conversationId = conversationId;
  emit("meta", { conversationId, isNew: isNewConversation });

  // 4. Context: knowledge, history, facts -------------------------------------------
  const [sources, rows, lead] = await Promise.all([
    deps.store.getApprovedKnowledge(bot.id),
    deps.store.getMessages(conversationId, config.historyTurns * 4),
    conversation.lead_id ? deps.store.getLead(conversation.lead_id) : Promise.resolve(null),
  ]);
  // Saved while the model streams (after reading history, so it isn't duplicated there).
  const userMessagePromise = deps.store.insertMessage({
    conversation_id: conversationId,
    role: "user",
    content: req.message,
    language: outcome.language,
  });
  const knowledge = buildKnowledgeBlock(sources, config.knowledgeTokenCap);
  const model = bot.model || config.defaultModel;

  // Retrieval mode (P1 knowledge too big for one prompt): pinned policies + chunks for this question.
  let approvedKnowledgeText = knowledge.text;
  let retrievedKnowledge: string | null = null;
  let retrievalInfo: { mode: "full" | "retrieval" | "full-capped"; titles?: string[]; query?: string } = { mode: "full" };
  if (knowledge.overCap && deps.retriever) {
    const lastUser = [...rows].reverse().find((r) => r.role === "user")?.content ?? "";
    try {
      const r = await deps.retriever.retrieve({
        botId: bot.id,
        sources,
        query: `${req.message}\n${lastUser}`.slice(0, 800),
        language: outcome.language,
        model,
        cap: config.knowledgeTokenCap,
      });
      if (r) {
        approvedKnowledgeText = r.pinnedText;
        retrievedKnowledge = r.retrievedText;
        retrievalInfo = { mode: "retrieval", titles: r.titles, query: r.query };
      } else {
        retrievalInfo = { mode: "full-capped" };
        const retriever = deps.retriever;
        outcome.jobs.push(() => retriever.sync(bot.id));
      }
    } catch (e) {
      console.error("[chat] retrieval failed, using capped knowledge", e instanceof Error ? e.message : e);
      retrievalInfo = { mode: "full-capped" };
    }
  } else if (knowledge.overCap) retrievalInfo = { mode: "full-capped" };
  const history = buildHistory(rows, config.historyTurns);

  const facts: string[] = [];
  if (history.olderNote) facts.push(history.olderNote);
  if (lead) facts.push(`The visitor's details are already saved: name ${lead.name}, phone ${lead.phone}. Don't ask for them again.`);
  if (conversation.status === "handed_off") facts.push("This conversation was already handed to the team; they will contact the visitor.");
  const id = req.identity;
  if (id && (id.name || id.phone || id.email)) {
    facts.push(
      `Visitor details provided by the website (logged-in customer): ${[id.name && `name ${id.name}`, id.phone && `phone ${id.phone}`, id.email && `email ${id.email}`].filter(Boolean).join(", ")}.`,
    );
  }

  const { staticText, contextText } = buildSystemPrompt({
    assistantName: bot.branding.assistant_name || "Assistant",
    businessName: bot.org.name,
    businessType: bot.org.business_type,
    tone: bot.tone,
    growth: bot.org.plan === "growth",
    approvedKnowledge: approvedKnowledgeText,
    retrievedKnowledge,
    nowInBusinessTimezone: formatNow(now, bot.org.timezone),
    businessHours: formatHours(bot.business_hours),
    isOpen: isOpenNow(bot.business_hours, bot.org.timezone, now),
    pageTitle: req.pageTitle,
    pageUrl: req.pageUrl,
    conversationFacts: facts,
  });

  const messages: LlmMessage[] = [...history.messages];
  // The current message is always last and from the user.
  const last = messages[messages.length - 1];
  if (last?.role === "user" && typeof last.content === "string") last.content += "\n\n" + req.message;
  else messages.push({ role: "user", content: req.message });

  // Text the visitor has typed (plus website identity) — the only place lead details may come from.
  const visitorDigits = digits(
    rows.filter((r) => r.role === "user").map((r) => r.content).join(" ") + " " + req.message + " " + (id?.phone ?? ""),
  );
  const phoneWasGiven = (phone: string) => {
    const p = normalizePhone(phone);
    return p.ok && visitorDigits.includes(digits(p.e164).slice(-10));
  };

  // 5. Model + tool loop ---------------------------------------------------------------
  const tools = toolsForPlan(bot.org.plan);
  let rounds = 0;
  try {
    while (rounds < config.maxToolRounds) {
      rounds++;
      const needsSeparator = outcome.text.length > 0;
      let wroteThisRound = false;
      const turn = await deps.llm.stream(
        {
          model,
          maxTokens: config.maxOutputTokens,
          system: [{ text: staticText, cache: true }, { text: contextText }],
          messages,
          tools,
        },
        (t) => {
          if (!wroteThisRound && needsSeparator) {
            outcome.text += "\n\n";
            emit("delta", { text: "\n\n" });
          }
          wroteThisRound = true;
          if (outcome.firstTokenMs === null) outcome.firstTokenMs = Date.now() - started;
          outcome.text += t;
          emit("delta", { text: t });
        },
      );
      outcome.usage = addUsage(outcome.usage, turn.usage);

      const toolUses = turn.content.filter((b): b is ToolUsePart => b.type === "tool_use");
      if (turn.stopReason !== "tool_use" || toolUses.length === 0) break;

      const results: ToolResultPart[] = [];
      for (const use of toolUses) {
        const result = await executeTool(use, {
          visitorId: req.visitorId,
          deps,
          bot,
          conversationId,
          isTest,
          pageTitle: req.pageTitle ?? null,
          phoneWasGiven,
          emit,
          outcome,
          lead,
        });
        outcome.toolCalls.push({ name: use.name, input: use.input, result });
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result) });
      }

      const onlyTerminal = toolUses.every((u) => TERMINAL_TOOLS.has(u.name));
      if (outcome.text.trim() && onlyTerminal) break; // already answered; no extra round trip

      messages.push({ role: "assistant", content: turn.content as (TextPart | ToolUsePart)[] });
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    console.error("[chat] model call failed", bot.id, e instanceof Error ? `${e.name}: ${e.message}` : e);
    emit("tool_card", { type: "fallback_contact", reason: "error", contact: bot.fallback_contact } satisfies ToolCard);
    emit("error", { code: "llm_error", message: "Sorry, I couldn't reply just now. You can reach the team directly." });
  }

  // 6. Persist + account ---------------------------------------------------------------
  outcome.latencyMs = Date.now() - started;
  const { pricing } = pricingFor(model);
  outcome.costUsd = computeCostUsd(outcome.usage, pricing);

  await userMessagePromise;
  const assistantId = await deps.store.insertMessage({
    conversation_id: conversationId,
    role: "assistant",
    content: outcome.text,
    tool_calls: outcome.toolCalls.length ? outcome.toolCalls : null,
    latency_ms: outcome.latencyMs,
    first_token_ms: outcome.firstTokenMs,
    input_tokens: outcome.usage.input,
    output_tokens: outcome.usage.output,
    cache_read_tokens: outcome.usage.cacheRead,
    cache_write_tokens: outcome.usage.cacheWrite,
    cost_usd: outcome.costUsd,
  });
  await deps.store.touchConversation(conversationId, 2, outcome.language);
  const usage = await deps.store.recordUsage({
    botId: bot.id,
    month,
    messages: 2,
    input: outcome.usage.input,
    output: outcome.usage.output,
    cacheRead: outcome.usage.cacheRead,
    cacheWrite: outcome.usage.cacheWrite,
    costUsd: outcome.costUsd,
  });

  // 80% quota warning, once per month (P15).
  if (isNewConversation && !isTest && shouldSendQuotaWarning(usage.conversations, quota, Boolean(usage.quotaWarnedAt))) {
    outcome.jobs.push(async () => {
      if (!(await deps.store.claimQuotaWarning(bot.id, month))) return;
      await dispatchNotice({
        store: deps.store,
        notifiers: deps.notifiers.filter((n) => n.channel === "email"),
        botId: bot.id,
        leadId: null,
        emails: bot.notify_emails,
        whatsapps: [],
        notice: { kind: "quota_warning", businessName: bot.org.name, botName: bot.name, summary: "", quota: { used: usage.conversations, limit: quota } },
      });
    });
  }

  if (ctx.debug) {
    emit("debug", {
      model,
      rounds,
      firstTokenMs: outcome.firstTokenMs,
      latencyMs: outcome.latencyMs,
      usage: outcome.usage,
      costUsd: outcome.costUsd,
      cacheHit: outcome.usage.cacheRead > 0,
      toolCalls: outcome.toolCalls,
      knowledge: {
        tokens: knowledge.tokens,
        cap: config.knowledgeTokenCap,
        included: knowledge.includedIds.length,
        excluded: knowledge.excludedIds.length,
        titles: retrievalInfo.titles ?? sources.filter((s) => knowledge.includedIds.includes(s.id)).map((s) => `${s.type}: ${s.title}`),
        mode: retrievalInfo.mode,
        query: retrievalInfo.query,
      },
      language: outcome.language,
      facts,
    });
  }
  emit("done", { conversationId, messageId: assistantId });
  return outcome;
}

type ToolCtx = {
  visitorId: string;
  deps: EngineDeps;
  bot: BotWithOrg;
  conversationId: string;
  isTest: boolean;
  pageTitle: string | null;
  phoneWasGiven: (phone: string) => boolean;
  emit: Emit;
  outcome: ChatOutcome;
  lead: Awaited<ReturnType<ChatStore["getLead"]>>;
};

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const LEAD_TYPES: LeadType[] = ["purchase", "human", "bulk", "callback", "other"];

async function executeTool(use: ToolUsePart, t: ToolCtx): Promise<Record<string, unknown>> {
  const { deps, bot, emit } = t;
  const input = use.input ?? {};
  switch (use.name) {
    case "suggest_followups": {
      const qs = Array.isArray(input.questions) ? input.questions : [];
      const questions = qs.map((q) => str(q, 80)).filter(Boolean).slice(0, 3);
      if (questions.length) emit("suggestions", { questions });
      return { ok: true };
    }

    case "report_unanswered": {
      const question = str(input.question) || "(unspecified)";
      await deps.store.mergeUnanswered(bot.id, t.conversationId, question, str(input.language, 20) || t.outcome.language);
      return {
        ok: true,
        not_in_knowledge: true,
        instruction: "Tell the visitor plainly you don't have that information and offer to connect them with the team. Do not guess.",
      };
    }

    case "capture_lead":
    case "handoff_to_human": {
      const handoff = use.name === "handoff_to_human";
      const typeRaw = str(input.type, 20) as LeadType;
      const type: LeadType = handoff ? "human" : LEAD_TYPES.includes(typeRaw) ? typeRaw : "other";
      const name = str(input.name, 80) || (handoff ? t.lead?.name ?? "" : "");
      const phone = str(input.phone, 40) || (handoff ? t.lead?.phone ?? "" : "");
      const need = str(input.need) || str(input.reason);
      const showForm = (error?: string) => {
        emit("tool_card", {
          type: "lead_form",
          leadType: type,
          prefill: { name: name || undefined, need: need || undefined },
          error,
        } satisfies ToolCard);
      };

      if (!name || !phone) {
        showForm();
        return {
          ok: false,
          form_shown: true,
          instruction: "A short contact form is now shown in the chat. Ask the visitor, in one sentence, to fill it in or type their name and phone number here.",
        };
      }
      // Rule 6 safety net: the phone must be one the visitor actually typed (or a saved lead's).
      const parsed = normalizePhone(phone);
      const isSavedPhone = Boolean(t.lead && parsed.ok && parsed.e164 === t.lead.phone);
      if (!isSavedPhone && !t.phoneWasGiven(phone)) {
        return { ok: false, error: "The visitor has not given this phone number in the chat. Ask them for it; never guess." };
      }

      const saved = await saveLead({
        store: deps.store,
        notifiers: deps.notifiers,
        bot,
        conversationId: t.conversationId,
        input: { name, phone, email: str(input.email, 200) || null, need, type, summary: str(input.summary, 400) || null },
        handoff,
        isTest: t.isTest,
        pageTitle: t.pageTitle,
      });
      if (!saved.ok) {
        showForm(saved.error);
        return { ok: false, error: saved.error, instruction: "Ask the visitor to correct it, or use the form shown." };
      }
      if (saved.notify) t.outcome.jobs.push(saved.notify);
      emit("tool_card", { type: "lead_saved", name: saved.lead.name, handoff } satisfies ToolCard);
      return {
        ok: true,
        saved: true,
        instruction: handoff
          ? "The team has been notified and will contact the visitor. Tell them briefly, in their language."
          : "Lead saved and the team was notified. Thank the visitor briefly and say the team will contact them.",
      };
    }

    case "lookup_order": {
      if (bot.org.plan !== "growth") return { ok: false, error: "Order lookup is not available." };
      const orderNumber = str(input.order_number, 40);
      const contact = str(input.phone_or_email, 200);
      if (!orderNumber || !contact) return { ok: false, error: "Ask for both the order number and the phone number or email used on the order." };
      // Stop order-number guessing: 5 lookups per visitor per 10 minutes.
      const limited = await deps.limiter.hit(`order:${bot.id}:${t.visitorId}`, 5, 600);
      if (!limited.allowed) return { ok: false, error: "Too many lookups. Offer to connect the visitor with the team." };
      const provider = deps.orders ? await deps.orders(bot.id) : null;
      if (!provider) return { ok: false, error: "Order lookup isn't set up for this store. Offer to connect the visitor with the team." };
      let order;
      try {
        order = await provider.lookup(orderNumber);
      } catch (e) {
        console.error("[chat] order lookup failed", e instanceof Error ? e.message : e);
        return { ok: false, error: "The store didn't respond. Apologise and offer to connect the visitor with the team." };
      }
      // Same answer for "no such order" and "details don't match": reveals nothing.
      if (!order || !verifyCustomer(order, contact)) {
        return { ok: false, not_found: true, instruction: "Say you couldn't find an order matching those details, ask them to check the number and the phone/email used, or offer the team." };
      }
      const card = toCard(order);
      emit("tool_card", { type: "order_status", ...card } satisfies ToolCard);
      return { ok: true, order: card, instruction: "Summarise the status in one sentence in the visitor's language. Share only these fields." };
    }

    case "request_callback": {
      if (bot.org.plan !== "growth") return { ok: false, error: "Callback booking is not available." };
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: bot.org.timezone }).format(new Date());
      const name = str(input.name, 80);
      const phone = str(input.phone, 40);
      const date = str(input.preferred_date, 10);
      const slot = str(input.preferred_slot, 40);
      const need = str(input.need);
      const form = (error?: string) =>
        emit("tool_card", { type: "callback_form", prefill: { name: name || undefined, date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined, slot: slot || undefined, need: need || undefined }, minDate: today, error } satisfies ToolCard);
      if (!name || !phone || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !slot) {
        form();
        return { ok: false, form_shown: true, instruction: "A short booking form is shown. Ask the visitor in one sentence to pick a date and time there (or type them)." };
      }
      if (!t.phoneWasGiven(phone)) return { ok: false, error: "The visitor has not given this phone number in the chat. Ask them for it; never guess." };
      if (date < today) {
        form("Please pick today or a later date.");
        return { ok: false, error: "That date is in the past. Ask for another date." };
      }
      const saved = await saveLead({
        store: deps.store,
        notifiers: deps.notifiers,
        bot,
        conversationId: t.conversationId,
        input: { name, phone, need, type: "callback", preferred_time: `${date}, ${slot}` },
        handoff: false,
        isTest: t.isTest,
        pageTitle: t.pageTitle,
      });
      if (!saved.ok) {
        form(saved.error);
        return { ok: false, error: saved.error };
      }
      if (saved.notify) t.outcome.jobs.push(saved.notify);
      emit("tool_card", { type: "lead_saved", name: saved.lead.name, handoff: false } satisfies ToolCard);
      return { ok: true, saved: true, instruction: `Confirm briefly that the team will call on ${date} (${slot}).` };
    }

    default:
      return { ok: false, error: `Unknown tool ${use.name}` };
  }
}

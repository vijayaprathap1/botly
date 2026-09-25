import { beforeEach, describe, expect, it } from "vitest";
import { runChat, type ChatEventName, type EngineDeps } from "@/lib/chat/engine";
import { MemoryStore } from "@/lib/chat/memory-store";
import { fixtureToBot, loadEvalFile } from "@/lib/eval/fixture";
import type { LlmClient, LlmRequest, LlmTurn, ToolUsePart } from "@/lib/llm/types";
import type { Notifier } from "@/lib/notify/types";
import { MemoryRateLimiter } from "@/lib/security/rate-limit";

const fixture = loadEvalFile("evals/ananya-handlooms.yaml").fixture!;
const ORIGIN = "http://localhost:4173";

/** Test double: each call pops the next scripted turn. */
class QueueLlm implements LlmClient {
  calls: LlmRequest[] = [];
  constructor(private turns: Array<{ text?: string; tools?: Array<{ name: string; input: Record<string, unknown> }> }>) {}
  async stream(req: LlmRequest, onText: (t: string) => void): Promise<LlmTurn> {
    this.calls.push(structuredClone(req));
    const t = this.turns.shift() ?? { text: "ok" };
    const content: LlmTurn["content"] = [];
    if (t.text) {
      for (const w of t.text.split(/(?<= )/)) onText(w);
      content.push({ type: "text", text: t.text });
    }
    for (const tool of t.tools ?? []) content.push({ type: "tool_use", id: "tu_" + Math.random(), name: tool.name, input: tool.input } as ToolUsePart);
    return { content, stopReason: t.tools?.length ? "tool_use" : "end_turn", usage: { input: 1000, output: 50, cacheRead: 0, cacheWrite: 0 }, firstTokenMs: 5 };
  }
}

class FakeEmail implements Notifier {
  readonly channel = "email" as const;
  sent: string[] = [];
  failTimes = 0;
  configured() { return true; }
  async send(to: string) {
    if (this.failTimes-- > 0) throw new Error("temporary");
    this.sent.push(to);
    return { providerId: "em_1" };
  }
}
class UnconfiguredWhatsApp implements Notifier {
  readonly channel = "whatsapp" as const;
  configured() { return false; }
  async send(): Promise<{ providerId?: string }> { throw new Error("should not be called"); }
}

let store: MemoryStore;
let email: FakeEmail;
const events: Array<{ event: ChatEventName; data: any }> = [];
const emit = (event: ChatEventName, data: unknown) => events.push({ event, data });
const deps = (llm: LlmClient): EngineDeps => ({ store, llm, limiter: new MemoryRateLimiter(), notifiers: [email, new UnconfiguredWhatsApp()] });
const req = (message: string, extra: Record<string, unknown> = {}) => ({ key: fixture.bot.public_key, visitorId: "visitor-123456", message, pageUrl: "http://localhost:4173/p/1", pageTitle: "Soft silk", ...extra });
const ctx = { origin: ORIGIN, ip: "1.2.3.4", debug: true };

beforeEach(() => {
  store = new MemoryStore();
  email = new FakeEmail();
  events.length = 0;
  const { bot, knowledge } = fixtureToBot(fixture);
  store.addBot(bot, knowledge);
});

describe("chat engine", () => {
  it("streams, saves both messages with cost, and builds a cacheable prompt", async () => {
    const llm = new QueueLlm([{ text: "COD is available across India." }]);
    const out = await runChat(deps(llm), req("Is COD available?"), ctx, emit);
    expect(events.map((e) => e.event)).toEqual(["meta", "delta", "delta", "delta", "delta", "delta", "debug", "done"]);
    expect(out.text).toBe("COD is available across India.");
    expect(store.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(store.messages[1]!.cost_usd).toBeCloseTo(0.00125, 6);
    const sys = llm.calls[0]!.system;
    expect(sys[0]!.cache).toBe(true);
    expect(sys[0]!.text).toContain("Cash on delivery (COD) is available across India");
    expect(sys[1]!.cache).toBeFalsy();
    expect(sys[1]!.text).toContain("Soft silk (http://localhost:4173/p/1)");
    expect(llm.calls[0]!.tools.map((t) => t.name)).toEqual(["capture_lead", "handoff_to_human", "report_unanswered", "suggest_followups"]);
    expect(llm.calls[0]!.maxTokens).toBe(400);
  });

  it("continues the conversation with history on the next message", async () => {
    const llm = new QueueLlm([{ text: "Yes." }, { text: "3–4 working days." }]);
    await runChat(deps(llm), req("Is COD available?"), ctx, emit);
    const conversationId = events.find((e) => e.event === "meta")!.data.conversationId;
    await runChat(deps(llm), req("Delivery to Puducherry?", { conversationId }), ctx, emit);
    expect(llm.calls[1]!.messages).toEqual([
      { role: "user", content: "Is COD available?" },
      { role: "assistant", content: "Yes." },
      { role: "user", content: "Delivery to Puducherry?" },
    ]);
    expect(store.conversations.size).toBe(1);
  });

  it("does not spend a second model call for terminal tools after an answer", async () => {
    const llm = new QueueLlm([{ text: "COD is available.", tools: [{ name: "suggest_followups", input: { questions: ["Returns?", "Delivery time?"] } }] }]);
    await runChat(deps(llm), req("COD?"), ctx, emit);
    expect(llm.calls).toHaveLength(1);
    expect(events.find((e) => e.event === "suggestions")!.data.questions).toEqual(["Returns?", "Delivery time?"]);
  });

  it("report_unanswered first, then the honest fallback in a second round", async () => {
    const llm = new QueueLlm([
      { tools: [{ name: "report_unanswered", input: { question: "Do you offer EMI?", language: "en" } }] },
      { text: "Sorry, I don't have that information. Shall I connect you with the team?" },
    ]);
    const out = await runChat(deps(llm), req("EMI?"), ctx, emit);
    expect(llm.calls).toHaveLength(2);
    expect(store.unanswered[0]!.question).toBe("Do you offer EMI?");
    expect(out.text).toContain("don't have that information");
    // Second call carries the tool result
    const lastMsg = llm.calls[1]!.messages.at(-1)!;
    expect(JSON.stringify(lastMsg.content)).toContain("not_in_knowledge");
  });

  it("refuses a lead whose phone the visitor never typed (rule 6)", async () => {
    const llm = new QueueLlm([
      { tools: [{ name: "capture_lead", input: { name: "Karthik", phone: "9884099999", need: "25 sarees", type: "bulk" } }] },
      { text: "Could you share your phone number?" },
    ]);
    await runChat(deps(llm), req("I need 25 sarees, I'm Karthik"), ctx, emit);
    expect(store.leads.size).toBe(0);
    expect(JSON.stringify(llm.calls[1]!.messages.at(-1)!.content)).toContain("has not given this phone number");
  });

  it("captures a lead the visitor gave, shows the card and notifies after the response", async () => {
    const llm = new QueueLlm([
      { tools: [{ name: "capture_lead", input: { name: "Karthik", phone: "98840 12345", need: "25 sarees for a wedding", type: "bulk" } }] },
      { text: "Thanks Karthik! Our team will call you." },
    ]);
    const out = await runChat(deps(llm), req("Karthik, 98840 12345"), ctx, emit);
    const lead = [...store.leads.values()][0]!;
    expect(lead).toMatchObject({ name: "Karthik", phone: "+919884012345", type: "bulk" });
    expect(store.conversations.get(out.conversationId!)!.lead_id).toBe(lead.id);
    expect(events.find((e) => e.event === "tool_card")!.data).toEqual({ type: "lead_saved", name: "Karthik", handoff: false });
    // Notification is deferred until jobs run
    expect(email.sent).toEqual([]);
    email.failTimes = 1; // first attempt fails, retry succeeds
    await Promise.all(out.jobs.map((j) => j()));
    expect(email.sent).toEqual(["owner@ananyahandlooms.example"]);
    const logs = store.notifications.map((n) => [n.channel, n.status, n.attempts]);
    expect(logs).toEqual([["email", "sent", 2], ["whatsapp", "pending_credentials", 0]]);
    expect(store.leads.get(lead.id)!.notified_email_at).toBeTruthy();
    expect(store.leads.get(lead.id)!.notified_whatsapp_at).toBeNull();
  }, 10_000);

  it("handoff without details shows the lead form", async () => {
    const llm = new QueueLlm([
      { tools: [{ name: "handoff_to_human", input: { reason: "asked for a person", summary: "Wants a person" } }] },
      { text: "Sure — please fill in the form below." },
    ]);
    await runChat(deps(llm), req("talk to a person"), ctx, emit);
    const card = events.find((e) => e.event === "tool_card")!.data;
    expect(card.type).toBe("lead_form");
    expect(card.leadType).toBe("human");
  });

  it("shows the contact card instead of AI replies when the monthly quota is used up", async () => {
    const bot = [...store.bots.values()][0]!;
    bot.monthly_conversation_quota = 1;
    const llm = new QueueLlm([{ text: "first" }]);
    await runChat(deps(llm), req("hi"), ctx, emit);
    events.length = 0;
    await runChat(deps(llm), { ...req("hi"), visitorId: "other-visitor-1" }, ctx, emit);
    expect(llm.calls).toHaveLength(1);
    expect(events[0]).toEqual({ event: "tool_card", data: { type: "fallback_contact", reason: "quota", contact: bot.fallback_contact } });
    expect(events[1]!.event).toBe("done");
  });

  it("test conversations never count toward quota", async () => {
    const bot = [...store.bots.values()][0]!;
    bot.monthly_conversation_quota = 0;
    const llm = new QueueLlm([{ text: "hello" }]);
    await runChat(deps(llm), req("hi", { testToken: bot.test_token }), { ...ctx, origin: "https://app.botly.example" }, emit);
    expect(llm.calls).toHaveLength(1);
  });

  it("rejects unknown origins and a wrong test token; inactive shows contact card", async () => {
    const llm = new QueueLlm([]);
    await runChat(deps(llm), req("hi"), { ...ctx, origin: "https://evil.example" }, emit);
    expect(events.at(-1)).toMatchObject({ event: "error", data: { code: "origin" } });
    await runChat(deps(llm), req("hi", { testToken: "tt_wrong" }), ctx, emit);
    expect(events.at(-1)).toMatchObject({ event: "error", data: { code: "bad_token" } });
    [...store.bots.values()][0]!.active = false;
    events.length = 0;
    await runChat(deps(llm), req("hi"), ctx, emit);
    expect(events.map((e) => e.event)).toEqual(["tool_card", "error"]);
    expect(llm.calls).toHaveLength(0);
  });

  it("draft bots only work embedded on localhost", async () => {
    const bot = [...store.bots.values()][0]!;
    bot.allowed_origins.push("https://ananyahandlooms.example");
    await runChat(deps(new QueueLlm([])), req("hi"), { ...ctx, origin: "https://ananyahandlooms.example" }, emit);
    expect(events.at(-1)).toMatchObject({ event: "error", data: { code: "inactive" } });
  });

  it("rate-limits a visitor at 20 messages per 10 minutes", async () => {
    const d = deps(new QueueLlm(Array.from({ length: 25 }, () => ({ text: "ok" }))));
    for (let i = 0; i < 20; i++) await runChat(d, req("hi"), ctx, () => {});
    await runChat(d, req("hi"), ctx, emit);
    expect(events.at(-1)).toMatchObject({ event: "error", data: { code: "rate_limited" } });
  });

  it("retrieval mode: over the cap, pinned + retrieved knowledge; no index yet → capped + sync job", async () => {
    process.env.KNOWLEDGE_TOKEN_CAP = "150";
    try {
      const synced: string[] = [];
      let index = false;
      const retriever = {
        async retrieve() {
          return index ? { pinnedText: "PINNED POLICIES", retrievedText: "<source>\nRETRIEVED CHUNK\n</source>", titles: ["faq: x"], chunkCount: 1, query: "q" } : null;
        },
        async sync(id: string) { synced.push(id); },
      };
      const llm = new QueueLlm([{ text: "one" }, { text: "two" }]);
      const out1 = await runChat({ ...deps(llm), retriever }, req("COD?"), ctx, emit);
      await Promise.all(out1.jobs.map((j) => j()));
      expect(synced).toHaveLength(1);
      expect(events.find((e) => e.event === "debug")!.data.knowledge.mode).toBe("full-capped");
      index = true;
      events.length = 0;
      await runChat({ ...deps(llm), retriever }, { ...req("COD?"), visitorId: "visitor-other-1" }, ctx, emit);
      const sys = llm.calls[1]!.system;
      expect(sys[0]!.text).toContain("PINNED POLICIES");
      expect(sys[1]!.text).toContain("RETRIEVED CHUNK");
      expect(events.find((e) => e.event === "debug")!.data.knowledge.mode).toBe("retrieval");
    } finally {
      delete process.env.KNOWLEDGE_TOKEN_CAP;
    }
  });

  describe("growth tools", () => {
    const provider = {
      name: "shopify" as const,
      async test() {},
      async lookup(n: string) {
        return n.includes("1042")
          ? { number: "#1042", contactEmails: ["priya@example.in"], contactPhones: ["+919790011223"], status: "In transit", carrier: "Delhivery", trackingNumber: "D1", trackingUrl: "https://t/1", expectedDate: "2026-10-01" }
          : null;
      },
    };
    const growth = () => {
      const bot = [...store.bots.values()][0]!;
      bot.org.plan = "growth";
      return bot;
    };

    it("starter bots don't get growth tools", async () => {
      const llm = new QueueLlm([{ text: "hi" }]);
      await runChat(deps(llm), req("hi"), ctx, emit);
      expect(llm.calls[0]!.tools.map((t) => t.name)).not.toContain("lookup_order");
      expect(llm.calls[0]!.system[0]!.text).not.toContain("lookup_order");
    });

    it("lookup_order: verified → status card only; wrong phone → generic not found", async () => {
      growth();
      const llm = new QueueLlm([
        { tools: [{ name: "lookup_order", input: { order_number: "#1042", phone_or_email: "9790011223" } }] },
        { text: "Your order is in transit." },
        { tools: [{ name: "lookup_order", input: { order_number: "#1042", phone_or_email: "9000000000" } }] },
        { text: "I couldn't find it." },
      ]);
      const d = { ...deps(llm), orders: async () => provider };
      await runChat(d, req("where is #1042? my phone 9790011223"), ctx, emit);
      expect(llm.calls[0]!.tools.map((t) => t.name)).toContain("lookup_order");
      const card = events.find((e) => e.event === "tool_card")!.data;
      expect(card).toEqual({ type: "order_status", orderNumber: "#1042", status: "In transit", carrier: "Delhivery", trackingUrl: "https://t/1", expectedDate: "2026-10-01" });
      const r1 = JSON.stringify(llm.calls[1]!.messages.at(-1)!.content);
      expect(r1).not.toContain("priya@example.in");
      events.length = 0;
      await runChat(d, { ...req("#1042, 9000000000"), visitorId: "visitor-guess-01" }, ctx, emit);
      expect(events.some((e) => e.event === "tool_card")).toBe(false);
      expect(JSON.stringify(llm.calls[3]!.messages.at(-1)!.content)).toContain("not_found");
    });

    it("lookup_order is rate limited per visitor (anti-enumeration)", async () => {
      growth();
      const turns = Array.from({ length: 7 }, () => [{ tools: [{ name: "lookup_order", input: { order_number: "1", phone_or_email: "9790011223" } }] }, { text: "x" }]).flat();
      const llm = new QueueLlm(turns);
      const d = { ...deps(llm), orders: async () => provider };
      for (let i = 0; i < 6; i++) await runChat(d, req("order 1 phone 9790011223"), ctx, () => {});
      expect(JSON.stringify(llm.calls.at(-1)!.messages.at(-1)!.content)).toContain("Too many lookups");
    });

    it("request_callback: missing details → booking form; complete → callback lead with time", async () => {
      growth();
      const llm = new QueueLlm([
        { tools: [{ name: "request_callback", input: { need: "Bridal saree video call" } }] },
        { text: "Please pick a time below." },
        { tools: [{ name: "request_callback", input: { name: "Meena", phone: "9790011223", preferred_date: "2099-01-05", preferred_slot: "evening", need: "Bridal video call" } }] },
        { text: "Booked!" },
      ]);
      await runChat(deps(llm), req("can someone call me about bridal sarees?"), ctx, emit);
      expect(events.find((e) => e.event === "tool_card")!.data.type).toBe("callback_form");
      const conversationId = events.find((e) => e.event === "meta")!.data.conversationId;
      await runChat(deps(llm), req("Meena 9790011223, 5 Jan 2099 evening", { conversationId }), ctx, emit);
      const lead = [...store.leads.values()][0]!;
      expect(lead).toMatchObject({ type: "callback", preferred_time: "2099-01-05, evening", phone: "+919790011223" });
    });
  });

  it("free trial: replies are counted and stop at the limit with the contact card", async () => {
    const bot = [...store.bots.values()][0]!;
    Object.assign(bot.org, { plan: "trial", trial_reply_limit: 2, trial_replies_used: 0, trial_ends_at: new Date(Date.now() + 86_400_000).toISOString() });
    const llm = new QueueLlm([{ text: "one" }, { text: "two" }, { text: "never" }]);
    await runChat(deps(llm), req("a"), ctx, emit);
    await runChat(deps(llm), { ...req("b"), visitorId: "visitor-trial-02" }, ctx, emit);
    events.length = 0;
    await runChat(deps(llm), { ...req("c"), visitorId: "visitor-trial-03" }, ctx, emit);
    expect(llm.calls).toHaveLength(2);
    expect(events.find((e) => e.event === "tool_card")!.data).toMatchObject({ type: "fallback_contact", reason: "quota" });
    expect(events.find((e) => e.event === "done")!.data.quota).toBe("trial_ended");
  });

  it("expired trial and suspended accounts get no AI replies", async () => {
    const bot = [...store.bots.values()][0]!;
    Object.assign(bot.org, { plan: "trial", trial_reply_limit: 50, trial_replies_used: 0, trial_ends_at: new Date(Date.now() - 1000).toISOString() });
    const llm = new QueueLlm([{ text: "x" }]);
    await runChat(deps(llm), req("a"), ctx, emit);
    Object.assign(bot.org, { plan: "starter", suspended: true });
    await runChat(deps(llm), { ...req("b"), visitorId: "visitor-susp-01" }, ctx, emit);
    expect(llm.calls).toHaveLength(0);
  });
});

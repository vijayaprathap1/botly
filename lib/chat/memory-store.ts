import { randomUUID } from "node:crypto";
import type { KnowledgeSource } from "../knowledge";
import type { BotWithOrg, ConversationRow, LeadRow, MessageRow } from "../types";
import type { ChatStore, NewLead, NewMessage, NotificationLog } from "./store";

/** In-memory ChatStore for unit tests and fixture evals (no database). */
export class MemoryStore implements ChatStore {
  bots = new Map<string, BotWithOrg>();
  knowledge = new Map<string, KnowledgeSource[]>();
  conversations = new Map<string, ConversationRow>();
  messages: MessageRow[] = [];
  leads = new Map<string, LeadRow>();
  unanswered: { id: string; botId: string; question: string; count: number; language: string | null }[] = [];
  usage = new Map<string, { conversations: number; messages: number; cost: number; warned: string | null }>();
  notifications: NotificationLog[] = [];

  addBot(bot: BotWithOrg, knowledge: KnowledgeSource[]) {
    this.bots.set(bot.public_key, bot);
    this.knowledge.set(bot.id, knowledge);
  }
  private u(botId: string, month: string) {
    const k = `${botId}:${month}`;
    if (!this.usage.has(k)) this.usage.set(k, { conversations: 0, messages: 0, cost: 0, warned: null });
    return this.usage.get(k)!;
  }

  async getBotByKey(key: string) {
    return this.bots.get(key) ?? null;
  }
  async getApprovedKnowledge(botId: string) {
    return this.knowledge.get(botId) ?? [];
  }
  async getConversation(id: string) {
    return this.conversations.get(id) ?? null;
  }
  async beginConversation(a: Parameters<ChatStore["beginConversation"]>[0]) {
    const u = this.u(a.botId, a.month);
    if (!a.isTest && u.conversations >= a.quota) return null;
    const id = randomUUID();
    const now = new Date().toISOString();
    this.conversations.set(id, {
      id, bot_id: a.botId, visitor_id: a.visitorId, page_url: a.pageUrl, page_title: a.pageTitle, language: a.language,
      status: "open", message_count: 0, lead_id: null, first_message_at: now, last_message_at: now, is_test: a.isTest,
      had_unanswered: false, created_at: now,
    });
    if (!a.isTest) u.conversations++;
    return id;
  }
  async getMessages(conversationId: string, limit: number, sinceIso?: string) {
    return this.messages
      .filter((m) => m.conversation_id === conversationId && (!sinceIso || m.created_at >= sinceIso))
      .slice(-limit);
  }
  async insertMessage(m: NewMessage) {
    const id = randomUUID();
    this.messages.push({
      id, conversation_id: m.conversation_id, role: m.role, content: m.content, language: m.language ?? null,
      tool_calls: m.tool_calls ?? null, latency_ms: m.latency_ms ?? null, first_token_ms: m.first_token_ms ?? null,
      input_tokens: m.input_tokens ?? 0, output_tokens: m.output_tokens ?? 0, cache_read_tokens: m.cache_read_tokens ?? 0,
      cache_write_tokens: m.cache_write_tokens ?? 0, cost_usd: m.cost_usd ?? 0, created_at: new Date().toISOString(),
    });
    return id;
  }
  async touchConversation(id: string, n: number, language: string | null) {
    const c = this.conversations.get(id);
    if (c) {
      c.message_count += n;
      c.last_message_at = new Date().toISOString();
      if (language) c.language = language;
    }
  }
  async setConversation(id: string, patch: Partial<ConversationRow>) {
    const c = this.conversations.get(id);
    if (c) Object.assign(c, patch);
  }
  async recordUsage(a: Parameters<ChatStore["recordUsage"]>[0]) {
    const u = this.u(a.botId, a.month);
    u.messages += a.messages;
    u.cost += a.costUsd;
    return { conversations: u.conversations, quotaWarnedAt: u.warned };
  }
  async claimQuotaWarning(botId: string, month: string) {
    const u = this.u(botId, month);
    if (u.warned) return false;
    u.warned = new Date().toISOString();
    return true;
  }
  async getUsedConversations(botId: string, month: string) {
    return this.u(botId, month).conversations;
  }
  async getLead(id: string) {
    return this.leads.get(id) ?? null;
  }
  async createLead(l: NewLead) {
    const lead: LeadRow = {
      id: randomUUID(), bot_id: l.bot_id, conversation_id: l.conversation_id, name: l.name, phone: l.phone,
      email: l.email ?? null, need: l.need ?? null, type: l.type, preferred_time: l.preferred_time ?? null, status: "new",
      summary: l.summary ?? null, notified_email_at: null, notified_whatsapp_at: null, created_at: new Date().toISOString(),
    };
    this.leads.set(lead.id, lead);
    return lead;
  }
  async updateLead(id: string, patch: Partial<LeadRow>) {
    const l = this.leads.get(id);
    if (l) Object.assign(l, patch);
  }
  async mergeUnanswered(botId: string, conversationId: string | null, question: string, language: string | null) {
    const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim();
    const hit = this.unanswered.find((u) => u.botId === botId && norm(u.question) === norm(question));
    if (hit) {
      hit.count++;
      return hit.id;
    }
    const id = randomUUID();
    this.unanswered.push({ id, botId, question, count: 1, language });
    if (conversationId) await this.setConversation(conversationId, { had_unanswered: true } as never);
    return id;
  }
  async logNotification(n: NotificationLog) {
    this.notifications.push(n);
  }

  async consumeReply(orgId: string) {
    const bot = [...this.bots.values()].find((b) => b.org.id === orgId);
    const o = bot?.org;
    if (!o) return "ok" as const;
    if (o.suspended) return "suspended" as const;
    if (o.plan !== "trial") return "ok" as const;
    if (o.trial_ends_at && new Date(o.trial_ends_at) < new Date()) return "expired" as const;
    if ((o.trial_replies_used ?? 0) >= (o.trial_reply_limit ?? 50)) return "limit" as const;
    for (const b of this.bots.values()) if (b.org.id === orgId) b.org.trial_replies_used = (o.trial_replies_used ?? 0) + 1;
    return "ok" as const;
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeSource } from "../knowledge";
import type { BotWithOrg, ConversationRow, LeadRow, MessageRow } from "../types";
import type { ChatStore, NewLead, NewMessage, NotificationLog } from "./store";

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`[store] ${what}: ${res.error.message}`);
  return res.data;
}

/** ChatStore on Supabase using the service role. Only call after key/origin checks. */
export class SupabaseStore implements ChatStore {
  constructor(private db: SupabaseClient) {}

  async getBotByKey(publicKey: string) {
    const res = await this.db.from("bots").select("*, org:organizations(*)").eq("public_key", publicKey).maybeSingle();
    return must(res, "getBotByKey") as BotWithOrg | null;
  }
  async getApprovedKnowledge(botId: string) {
    const res = await this.db
      .from("knowledge_sources")
      .select("id, type, title, url, content, updated_at")
      .eq("bot_id", botId)
      .eq("status", "approved");
    return must(res, "getApprovedKnowledge") as KnowledgeSource[];
  }
  async getConversation(id: string) {
    const res = await this.db.from("conversations").select("*").eq("id", id).maybeSingle();
    return must(res, "getConversation") as ConversationRow | null;
  }
  async beginConversation(a: Parameters<ChatStore["beginConversation"]>[0]) {
    const res = await this.db.rpc("begin_conversation", {
      p_bot_id: a.botId,
      p_visitor_id: a.visitorId,
      p_page_url: a.pageUrl,
      p_page_title: a.pageTitle,
      p_language: a.language,
      p_month: a.month,
      p_quota: a.quota,
      p_is_test: a.isTest,
    });
    return must(res, "beginConversation") as string | null;
  }
  async getMessages(conversationId: string, limit: number, sinceIso?: string) {
    let q = this.db.from("messages").select("*").eq("conversation_id", conversationId);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const res = await q.order("created_at", { ascending: false }).limit(limit);
    return (must(res, "getMessages") as MessageRow[]).reverse();
  }
  async insertMessage(m: NewMessage) {
    const res = await this.db.from("messages").insert(m).select("id").single();
    return (must(res, "insertMessage") as { id: string }).id;
  }
  async touchConversation(id: string, n: number, language: string | null) {
    must(await this.db.rpc("touch_conversation", { p_conversation_id: id, p_messages: n, p_language: language }), "touchConversation");
  }
  async setConversation(id: string, patch: Partial<ConversationRow>) {
    must(await this.db.from("conversations").update(patch).eq("id", id), "setConversation");
  }
  async recordUsage(a: Parameters<ChatStore["recordUsage"]>[0]) {
    const res = await this.db.rpc("record_usage", {
      p_bot_id: a.botId,
      p_month: a.month,
      p_messages: a.messages,
      p_input: a.input,
      p_output: a.output,
      p_cache_read: a.cacheRead,
      p_cache_write: a.cacheWrite,
      p_cost: a.costUsd,
    });
    const row = (must(res, "recordUsage") as { conversations: number; quota_warned_at: string | null }[])[0];
    return { conversations: row?.conversations ?? 0, quotaWarnedAt: row?.quota_warned_at ?? null };
  }
  async claimQuotaWarning(botId: string, month: string) {
    return must(await this.db.rpc("claim_quota_warning", { p_bot_id: botId, p_month: month }), "claimQuotaWarning") as boolean;
  }
  async getUsedConversations(botId: string, month: string) {
    const res = await this.db.from("usage_monthly").select("conversations").eq("bot_id", botId).eq("month", month).maybeSingle();
    return (must(res, "getUsedConversations") as { conversations: number } | null)?.conversations ?? 0;
  }
  async getLead(id: string) {
    return must(await this.db.from("leads").select("*").eq("id", id).maybeSingle(), "getLead") as LeadRow | null;
  }
  async createLead(l: NewLead) {
    return must(await this.db.from("leads").insert(l).select("*").single(), "createLead") as LeadRow;
  }
  async updateLead(id: string, patch: Partial<LeadRow>) {
    must(await this.db.from("leads").update(patch).eq("id", id), "updateLead");
  }
  async mergeUnanswered(botId: string, conversationId: string | null, question: string, language: string | null) {
    const res = await this.db.rpc("merge_unanswered", {
      p_bot_id: botId,
      p_conversation_id: conversationId,
      p_question: question,
      p_language: language,
    });
    return must(res, "mergeUnanswered") as string;
  }
  async logNotification(n: NotificationLog) {
    const res = await this.db.from("notifications").insert({ ...n, sent_at: n.status === "sent" ? new Date().toISOString() : null });
    if (res.error) console.error("[store] logNotification", res.error.message);
  }
}

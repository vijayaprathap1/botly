import type { KnowledgeSource } from "../knowledge";
import type { BotWithOrg, ConversationRow, LeadRow, LeadType, MessageRow, ToolCallLog } from "../types";

export type NewMessage = {
  conversation_id: string;
  role: MessageRow["role"];
  content: string;
  language?: string | null;
  tool_calls?: ToolCallLog[] | null;
  latency_ms?: number | null;
  first_token_ms?: number | null;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  cost_usd?: number;
};

export type NewLead = {
  bot_id: string;
  conversation_id: string | null;
  name: string;
  phone: string;
  email?: string | null;
  need?: string | null;
  type: LeadType;
  summary?: string | null;
  preferred_time?: string | null;
};

export type NotificationLog = {
  bot_id: string;
  lead_id: string | null;
  kind: string;
  channel: "email" | "whatsapp";
  recipient: string;
  status: "sent" | "failed" | "pending_credentials" | "skipped";
  attempts: number;
  error?: string | null;
  provider_id?: string | null;
};

/** Everything the chat engine needs from storage. Supabase in production, memory in tests/evals. */
export interface ChatStore {
  getBotByKey(publicKey: string): Promise<BotWithOrg | null>;
  getApprovedKnowledge(botId: string): Promise<KnowledgeSource[]>;
  getConversation(id: string): Promise<ConversationRow | null>;
  beginConversation(args: {
    botId: string;
    visitorId: string;
    pageUrl: string | null;
    pageTitle: string | null;
    language: string | null;
    month: string;
    quota: number;
    isTest: boolean;
  }): Promise<string | null>;
  /** Most recent messages first is NOT assumed: returns oldest → newest, at most `limit`. */
  getMessages(conversationId: string, limit: number, sinceIso?: string): Promise<MessageRow[]>;
  insertMessage(m: NewMessage): Promise<string>;
  touchConversation(id: string, addMessages: number, language: string | null): Promise<void>;
  setConversation(id: string, patch: Partial<Pick<ConversationRow, "status" | "lead_id">>): Promise<void>;
  recordUsage(args: {
    botId: string;
    month: string;
    messages: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    costUsd: number;
  }): Promise<{ conversations: number; quotaWarnedAt: string | null }>;
  claimQuotaWarning(botId: string, month: string): Promise<boolean>;
  getUsedConversations(botId: string, month: string): Promise<number>;
  getLead(id: string): Promise<LeadRow | null>;
  createLead(l: NewLead): Promise<LeadRow>;
  updateLead(id: string, patch: Partial<LeadRow>): Promise<void>;
  mergeUnanswered(botId: string, conversationId: string | null, question: string, language: string | null): Promise<string>;
  logNotification(n: NotificationLog): Promise<void>;
  /** Uses one AI reply from a free trial (atomic). 'ok' for paid plans. */
  consumeReply(orgId: string): Promise<"ok" | "expired" | "limit" | "suspended">;
}

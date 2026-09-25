import type { BusinessHours } from "./hours";

export type Plan = "starter" | "growth";
export type Branding = {
  primary_color: string;
  avatar_url: string | null;
  assistant_name: string;
  position: "left" | "right";
  theme: "light" | "dark" | "auto";
  show_powered_by: boolean;
};
export type FallbackContact = { phone?: string; email?: string; whatsapp?: string };

export type OrgRow = {
  id: string;
  name: string;
  business_type: string;
  plan: Plan;
  monthly_conversation_quota: number;
  timezone: string;
  retention_months: number;
  minutes_saved_per_conversation: number;
};

export type BotRow = {
  id: string;
  org_id: string;
  name: string;
  public_key: string;
  test_token: string;
  active: boolean;
  status: "draft" | "live";
  allowed_origins: string[];
  model: string;
  tone: string;
  tone_suggestion: string | null;
  languages: string[];
  greeting: string;
  nudge: string | null;
  suggested_questions: string[];
  branding: Branding;
  business_hours: BusinessHours;
  notify_emails: string[];
  notify_whatsapp: string[];
  fallback_contact: FallbackContact;
  privacy_url: string | null;
  monthly_conversation_quota: number | null;
  website_url: string | null;
  updated_at: string;
  created_at: string;
};

export type BotWithOrg = BotRow & { org: OrgRow };

export type LeadType = "purchase" | "human" | "bulk" | "callback" | "other";
export type LeadRow = {
  id: string;
  bot_id: string;
  conversation_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  need: string | null;
  type: LeadType;
  preferred_time: string | null;
  status: "new" | "contacted" | "won" | "lost";
  summary: string | null;
  notified_email_at: string | null;
  notified_whatsapp_at: string | null;
  created_at: string;
};

export type ConversationRow = {
  id: string;
  bot_id: string;
  visitor_id: string;
  page_url: string | null;
  page_title: string | null;
  language: string | null;
  status: "open" | "handed_off" | "closed";
  message_count: number;
  lead_id: string | null;
  first_message_at: string | null;
  last_message_at: string | null;
  is_test: boolean;
  had_unanswered: boolean;
  created_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system_event";
  content: string;
  language: string | null;
  tool_calls: ToolCallLog[] | null;
  latency_ms: number | null;
  first_token_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  created_at: string;
};

export type ToolCallLog = { name: string; input: unknown; result: unknown };

export const DEFAULT_BRANDING: Branding = {
  primary_color: "#4f46e5",
  avatar_url: null,
  assistant_name: "Assistant",
  position: "right",
  theme: "auto",
  show_powered_by: true,
};

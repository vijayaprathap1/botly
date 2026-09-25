import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";

const source = z.object({
  type: z.enum(["page", "faq", "policy", "product", "file", "note"]),
  title: z.string(),
  url: z.string().url().nullish(),
  content: z.string(),
});

export const fixtureSchema = z.object({
  org: z.object({
    id: z.string().uuid(),
    name: z.string(),
    business_type: z.string(),
    plan: z.enum(["starter", "growth"]),
    monthly_conversation_quota: z.number().int(),
    timezone: z.string(),
  }),
  bot: z.object({
    id: z.string().uuid(),
    name: z.string(),
    public_key: z.string(),
    test_token: z.string(),
    status: z.enum(["draft", "live"]),
    website_url: z.string().nullish(),
    allowed_origins: z.array(z.string()),
    tone: z.string(),
    greeting: z.string(),
    nudge: z.string().nullish(),
    suggested_questions: z.array(z.string()),
    branding: z.record(z.string(), z.unknown()),
    notify_emails: z.array(z.string()),
    notify_whatsapp: z.array(z.string()),
    fallback_contact: z.record(z.string(), z.string()),
    privacy_url: z.string().nullish(),
  }),
  knowledge: z.array(source),
});

const turnCase = z.object({
  id: z.string(),
  category: z.enum(["in_knowledge", "out_of_knowledge", "language", "injection", "lead"]),
  message: z.string().optional(),
  turns: z.array(z.string()).optional(),
  page_title: z.string().optional(),
  page_url: z.string().optional(),
  contains_any: z.array(z.array(z.string())).optional(),
  not_contains: z.array(z.string()).optional(),
  tool_called: z.string().optional(),
  tool_not_called: z.string().optional(),
  language: z.enum(["en", "ta", "hi", "hinglish", "tanglish"]).optional(),
  no_unknown_prices: z.boolean().optional(),
  lead: z.object({ phone: z.string() }).optional(),
});

export const evalFileSchema = z.object({ fixture: fixtureSchema.optional(), cases: z.array(turnCase) });
export type EvalFile = z.infer<typeof evalFileSchema>;
export type EvalCase = z.infer<typeof turnCase>;
export type Fixture = z.infer<typeof fixtureSchema>;

export function loadEvalFile(path: string): EvalFile {
  return evalFileSchema.parse(parse(readFileSync(path, "utf8")));
}

import type { KnowledgeSource } from "../knowledge";
import { DEFAULT_BRANDING, type BotWithOrg, type Branding } from "../types";

/** Build an in-memory bot (same shape as the DB row) from an eval fixture. */
export function fixtureToBot(f: Fixture): { bot: BotWithOrg; knowledge: KnowledgeSource[] } {
  const now = new Date().toISOString();
  const bot: BotWithOrg = {
    id: f.bot.id,
    org_id: f.org.id,
    name: f.bot.name,
    public_key: f.bot.public_key,
    test_token: f.bot.test_token,
    active: true,
    status: f.bot.status,
    allowed_origins: f.bot.allowed_origins,
    model: process.env.ANTHROPIC_DEFAULT_MODEL || "claude-haiku-4-5",
    tone: f.bot.tone,
    tone_suggestion: null,
    languages: ["en", "ta", "hi"],
    greeting: f.bot.greeting,
    nudge: f.bot.nudge ?? null,
    suggested_questions: f.bot.suggested_questions,
    branding: { ...DEFAULT_BRANDING, ...(f.bot.branding as Partial<Branding>) },
    business_hours: {
      mon: [["10:00", "19:00"]], tue: [["10:00", "19:00"]], wed: [["10:00", "19:00"]], thu: [["10:00", "19:00"]],
      fri: [["10:00", "19:00"]], sat: [["10:00", "19:00"]], sun: [],
    },
    notify_emails: f.bot.notify_emails,
    notify_whatsapp: f.bot.notify_whatsapp,
    fallback_contact: f.bot.fallback_contact,
    privacy_url: f.bot.privacy_url ?? null,
    monthly_conversation_quota: null,
    website_url: f.bot.website_url ?? null,
    updated_at: now,
    created_at: now,
    org: {
      id: f.org.id,
      name: f.org.name,
      business_type: f.org.business_type,
      plan: f.org.plan,
      monthly_conversation_quota: f.org.monthly_conversation_quota,
      timezone: f.org.timezone,
      retention_months: 12,
      minutes_saved_per_conversation: 3,
    },
  };
  const knowledge: KnowledgeSource[] = f.knowledge.map((k, i) => ({
    id: `k${String(i).padStart(3, "0")}`,
    type: k.type,
    title: k.title,
    url: k.url ?? null,
    content: k.content,
  }));
  return { bot, knowledge };
}

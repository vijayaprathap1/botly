import { requestTokenLimit, resolveModel } from "./llm/provider";

/** Server-side configuration read from the environment (never sent to the browser). */
export type ModelPricing = { input: number; output: number; cache_write: number; cache_read: number };

const DEFAULT_PRICING: Record<string, ModelPricing> = {
  // Fallback only. The source of truth is LLM_PRICING_JSON in the environment.
  "claude-haiku-4-5": { input: 1, output: 5, cache_write: 1.25, cache_read: 0.1 },
};

function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export function pricingTable(): Record<string, ModelPricing> {
  const raw = process.env.LLM_PRICING_JSON;
  if (!raw) return DEFAULT_PRICING;
  try {
    return { ...DEFAULT_PRICING, ...(JSON.parse(raw) as Record<string, ModelPricing>) };
  } catch {
    console.error("[config] LLM_PRICING_JSON is not valid JSON; using defaults");
    return DEFAULT_PRICING;
  }
}

export const config = {
  get appUrl() {
    return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  },
  get defaultModel() {
    return resolveModel(null);
  },
  get knowledgeTokenCap() {
    // Small free tiers (e.g. Groq ~8k tokens a minute) can't take 25k of knowledge per
    // message: leave room for the prompt, history and the reply.
    const limit = requestTokenLimit();
    return int("KNOWLEDGE_TOKEN_CAP", limit ? Math.max(2_000, limit - 3_500) : 25_000);
  },
  get visitorLimitPer10Min() {
    return int("RATE_LIMIT_VISITOR_PER_10MIN", 20);
  },
  get botLimitPerMin() {
    return int("RATE_LIMIT_BOT_PER_MIN", 30);
  },
  /**
   * AI replies (model calls) allowed in one conversation. 0 disables the cap.
   * MAX_AI_REPLIES_PER_CONVERSATION_TRIAL / _STARTER / _GROWTH override the shared value.
   */
  maxAiReplies(plan?: string) {
    const specific = plan ? process.env[`MAX_AI_REPLIES_PER_CONVERSATION_${plan.toUpperCase()}`] : undefined;
    const raw = specific !== undefined && specific.trim() !== "" ? specific : process.env.MAX_AI_REPLIES_PER_CONVERSATION;
    if (raw === undefined || raw.trim() === "") return 30;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 30;
    return Math.floor(n);
  },
  /**
   * AI replies allowed in one demo conversation. 0 disables the cap.
   * Separate from the plan cap so a sales preview cannot run as long as a customer trial.
   */
  get demoMaxAiReplies() {
    const raw = process.env.DEMO_MAX_AI_REPLIES_PER_CONVERSATION;
    if (raw === undefined || raw.trim() === "") return 15;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 15;
    return Math.floor(n);
  },
  get crawlMaxPages() {
    return int("CRAWL_MAX_PAGES", 40);
  },
  defaultQuota(plan: "trial" | "starter" | "growth") {
    if (plan === "trial") return 1_000_000; // trials are limited by replies, not conversations
    return plan === "growth" ? int("DEFAULT_QUOTA_GROWTH", 10_000) : int("DEFAULT_QUOTA_STARTER", 2_000);
  },
  get adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
  maxOutputTokens: 400,
  historyTurns: 12,
  maxToolRounds: 3,
};

import { afterEach, describe, expect, it, vi } from "vitest";
import { budgetDecision, budgetLimits } from "../../lib/llm/budget";
import { deepCheckMode } from "../../lib/ai-check";
import { config } from "../../lib/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AI budget", () => {
  it("defaults sit under Groq's 250k tokens per minute", () => {
    vi.stubEnv("AI_BUDGET_REQUESTS_PER_MIN", "");
    vi.stubEnv("AI_BUDGET_TOKENS_PER_MIN", "");
    vi.stubEnv("AI_BUDGET_REQUESTS_PER_DAY", "");
    vi.stubEnv("AI_BUDGET_TOKENS_PER_DAY", "");
    const limits = budgetLimits();
    expect(limits.tpm).toBeLessThan(250_000);
    expect(limits).toEqual({ rpm: 40, tpm: 200_000, rpd: 10_000, tpd: 15_000_000 });
  });

  it("blocks the minute window before the day, and lets a zero limit mean uncapped", () => {
    const limits = { rpm: 40, tpm: 200_000, rpd: 10, tpd: 1_000 };
    expect(budgetDecision({ rpm: 40, tpm: 0, rpd: 0, tpd: 0 }, { requests: 1, tokens: 10 }, limits)).toBe("minute");
    expect(budgetDecision({ rpm: 1, tpm: 190_000, rpd: 0, tpd: 0 }, { requests: 1, tokens: 20_000 }, limits)).toBe("minute");
    expect(budgetDecision({ rpm: 0, tpm: 0, rpd: 10, tpd: 0 }, { requests: 1, tokens: 10 }, limits)).toBe("day");
    expect(budgetDecision({ rpm: 0, tpm: 0, rpd: 0, tpd: 0 }, { requests: 1, tokens: 10 }, { rpm: 0, tpm: 0, rpd: 0, tpd: 0 })).toBe("ok");
  });
});

describe("chat caps", () => {
  it("defaults the per-bot minute limit to 30 and the conversation cap to 30 for every plan", () => {
    vi.stubEnv("RATE_LIMIT_BOT_PER_MIN", "");
    vi.stubEnv("MAX_AI_REPLIES_PER_CONVERSATION", "");
    vi.stubEnv("MAX_AI_REPLIES_PER_CONVERSATION_GROWTH", "");
    expect(config.botLimitPerMin).toBe(30);
    expect(config.maxAiReplies("growth")).toBe(30);
    expect(config.maxAiReplies("trial")).toBe(30);
    vi.stubEnv("MAX_AI_REPLIES_PER_CONVERSATION", "40");
    vi.stubEnv("MAX_AI_REPLIES_PER_CONVERSATION_GROWTH", "80");
    expect(config.maxAiReplies("starter")).toBe(40);
    expect(config.maxAiReplies("growth")).toBe(80);
    vi.stubEnv("MAX_AI_REPLIES_PER_CONVERSATION", "0");
    vi.stubEnv("MAX_AI_REPLIES_PER_CONVERSATION_GROWTH", "");
    expect(config.maxAiReplies("growth")).toBe(0);
  });
});

describe("deep health", () => {
  it("only calls the model for an authorized deep check", () => {
    expect(deepCheckMode({ requested: false, authorized: false, cacheFresh: false })).toBe("none");
    expect(deepCheckMode({ requested: true, authorized: true, cacheFresh: false })).toBe("live");
    expect(deepCheckMode({ requested: true, authorized: false, cacheFresh: true })).toBe("cached");
    expect(deepCheckMode({ requested: true, authorized: false, cacheFresh: false })).toBe("omit");
  });
});

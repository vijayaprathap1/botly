import { openAiPing } from "./llm/openai-compat";
import { llmKeyName, llmProvider, providerLabel } from "./llm/provider";

/** Live check of the configured LLM (cached 5 minutes). Returns the provider's own error text, never the key. */
let cache: { at: number; ok: boolean; error: string | null; provider: string } | null = null;

export async function checkLlmLive(): Promise<{ at: number; ok: boolean; error: string | null; provider: string }> {
  if (cache && Date.now() - cache.at < 300_000) return cache;
  const provider = providerLabel();
  const done = (ok: boolean, error: string | null) => (cache = { at: Date.now(), ok, error, provider });
  if (llmProvider() === "openai") {
    const err = await openAiPing();
    return done(!err, err);
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return done(false, `${llmKeyName()} is not set`);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_DEFAULT_MODEL || "claude-haiku-4-5", max_tokens: 1, messages: [{ role: "user", content: "ok" }] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return done(true, null);
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return done(false, `${res.status}: ${body?.error?.message ?? "request failed"}`);
  } catch (e) {
    return done(false, e instanceof Error ? e.message : "unreachable");
  }
}

/** @deprecated use checkLlmLive */
export const checkAnthropicLive = checkLlmLive;

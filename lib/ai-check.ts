import { openAiPing } from "./llm/openai-compat";
import { llmKeyName, llmProvider, providerLabel } from "./llm/provider";

/** Live check of the configured LLM (cached 5 minutes). Returns the provider's own error text, never the key. */
export const LLM_HEALTH_FRESH_MS = 300_000;
export type LlmHealth = { at: number; ok: boolean; error: string | null; provider: string };
let cache: LlmHealth | null = null;

/** In-process result from the last 5 minutes, if any. Does not call the model. */
export function peekLlmCache(): LlmHealth | null {
  if (!cache || Date.now() - cache.at >= LLM_HEALTH_FRESH_MS) return null;
  return cache;
}

/**
 * What /api/health?deep=1 should do.
 * Public callers never start a model call: they see a fresh cache or nothing.
 */
export function deepCheckMode(args: { requested: boolean; authorized: boolean; cacheFresh: boolean }): "none" | "live" | "cached" | "omit" {
  if (!args.requested) return "none";
  if (args.authorized) return "live";
  if (args.cacheFresh) return "cached";
  return "omit";
}

export async function checkLlmLive(): Promise<LlmHealth> {
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

function healthDbConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return url.startsWith("http") && key.length > 20;
}

let loggedHealthCache = false;

/** Shared 5-minute result so one instance's check serves the others. Null when missing or stale. */
export async function readSharedLlmCache(): Promise<LlmHealth | null> {
  if (!healthDbConfigured()) return null;
  try {
    const { supabaseAdmin } = await import("./supabase/admin");
    const { data, error } = await supabaseAdmin().from("platform_state").select("value").eq("key", "llm_health").maybeSingle();
    if (error || !data) return null;
    const value = data.value as LlmHealth | null;
    if (!value || typeof value.at !== "number" || Date.now() - value.at >= LLM_HEALTH_FRESH_MS) return null;
    return { at: value.at, ok: Boolean(value.ok), error: value.error ?? null, provider: value.provider ?? "" };
  } catch (e) {
    if (!loggedHealthCache) {
      loggedHealthCache = true;
      console.error("[health] cache read", e instanceof Error ? e.message : e);
    }
    return null;
  }
}

export async function writeSharedLlmCache(entry: LlmHealth): Promise<void> {
  if (!healthDbConfigured()) return;
  try {
    const { supabaseAdmin } = await import("./supabase/admin");
    const { error } = await supabaseAdmin().from("platform_state").upsert({ key: "llm_health", value: entry, updated_at: new Date().toISOString() });
    if (error && !loggedHealthCache) {
      loggedHealthCache = true;
      console.error("[health] cache write", error.message);
    }
  } catch (e) {
    if (!loggedHealthCache) {
      loggedHealthCache = true;
      console.error("[health] cache write", e instanceof Error ? e.message : e);
    }
  }
}

/** @deprecated use checkLlmLive */
export const checkAnthropicLive = checkLlmLive;

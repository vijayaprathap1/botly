/** Live check of the Anthropic key (cached 5 minutes). Returns Anthropic's own error text, never the key. */
let cache: { at: number; ok: boolean; error: string | null } | null = null;

export async function checkAnthropicLive(): Promise<{ at: number; ok: boolean; error: string | null }> {
  if (cache && Date.now() - cache.at < 300_000) return cache;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return (cache = { at: Date.now(), ok: false, error: "ANTHROPIC_API_KEY is not set" });
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_DEFAULT_MODEL || "claude-haiku-4-5", max_tokens: 1, messages: [{ role: "user", content: "ok" }] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return (cache = { at: Date.now(), ok: true, error: null });
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return (cache = { at: Date.now(), ok: false, error: `${res.status}: ${body?.error?.message ?? "request failed"}` });
  } catch (e) {
    return (cache = { at: Date.now(), ok: false, error: e instanceof Error ? e.message : "unreachable" });
  }
}

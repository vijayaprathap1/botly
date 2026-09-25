import { blockingProblems, featureProblems } from "@/lib/env-check";
import { checkAnthropicLive } from "@/lib/ai-check";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Uptime check: config present and database answering. No secrets or details leak. */
export async function GET(req: Request) {
  const envOk = blockingProblems().length === 0;
  let dbOk = false;
  if (envOk) {
    try {
      const { error } = await supabaseAdmin().from("bots").select("id", { head: true, count: "exact" }).limit(1);
      dbOk = !error;
      if (error) console.error("[health] db:", error.message);
    } catch (e) {
      console.error("[health]", e instanceof Error ? e.message : e);
    }
  }
  const features = featureProblems().map((p) => p.name);
  // ?deep=1 also makes a real 1-token call to Claude and reports Anthropic's error text.
  const deep = new URL(req.url).searchParams.get("deep") === "1" ? await checkAnthropicLive() : null;
  const ok = envOk && dbOk && !features.includes("ANTHROPIC_API_KEY") && (deep ? deep.ok : true);
  return Response.json({ ok, config: envOk, database: dbOk, ai: !features.includes("ANTHROPIC_API_KEY"), email: !features.includes("RESEND_API_KEY"), ...(deep ? { ai_live: deep.ok, ai_error: deep.error } : {}) }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

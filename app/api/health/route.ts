import { providerLabel, resolveModel } from "@/lib/llm/provider";
import { AI_KEY_NAMES, blockingProblems, featureProblems } from "@/lib/env-check";
import { checkLlmLive } from "@/lib/ai-check";
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
  // ?deep=1 also makes a real 1-token call to the configured LLM and reports its error text.
  const deep = new URL(req.url).searchParams.get("deep") === "1" ? await checkLlmLive() : null;
  const aiOk = !features.some((f) => AI_KEY_NAMES.includes(f));
  const ok = envOk && dbOk && aiOk && (deep ? deep.ok : true);
  return Response.json({ ok, config: envOk, database: dbOk, ai: aiOk, ai_provider: providerLabel(), email: !features.includes("RESEND_API_KEY"), payments: !features.includes("RAZORPAY"), ...(deep ? { ai_live: deep.ok, ai_error: deep.error, ai_model: resolveModel(null) } : {}) }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

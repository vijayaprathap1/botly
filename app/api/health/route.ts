import { providerLabel, resolveModel } from "@/lib/llm/provider";
import { AI_KEY_NAMES, blockingProblems, featureProblems } from "@/lib/env-check";
import { checkLlmLive, deepCheckMode, peekLlmCache, readSharedLlmCache, writeSharedLlmCache } from "@/lib/ai-check";
import { cronAuthorized } from "@/lib/cron";
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
  // ?deep=1 reports a real model call. Without the cron secret or an admin session it
  // only returns a result cached for 5 minutes, and never starts a new call.
  const wantDeep = new URL(req.url).searchParams.get("deep") === "1";
  const authorized = wantDeep && (cronAuthorized(req) || (await adminRequest(req)));
  const cached = wantDeep && !authorized ? (peekLlmCache() ?? (await readSharedLlmCache())) : null;
  const mode = deepCheckMode({ requested: wantDeep, authorized, cacheFresh: Boolean(cached) });
  const deep = mode === "live" ? await checkLlmLive() : mode === "cached" ? cached : null;
  if (mode === "live" && deep) await writeSharedLlmCache(deep);
  const aiOk = !features.some((f) => AI_KEY_NAMES.includes(f));
  const ok = envOk && dbOk && aiOk && (deep ? deep.ok : true);
  return Response.json({ ok, config: envOk, database: dbOk, ai: aiOk, ai_provider: providerLabel(), email: !features.includes("RESEND_API_KEY"), payments: !features.includes("RAZORPAY"), ...(deep ? { ai_live: deep.ok, ai_error: deep.error, ai_model: resolveModel(null) } : {}) }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

async function adminRequest(req: Request): Promise<boolean> {
  if (!req.headers.get("cookie")) return false;
  try {
    const { getSession } = await import("@/lib/auth");
    return Boolean((await getSession())?.isAdmin);
  } catch (e) {
    console.error("[health] admin check", e instanceof Error ? e.message : e);
    return false;
  }
}

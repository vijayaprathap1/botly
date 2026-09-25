import { blockingProblems, featureProblems } from "@/lib/env-check";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Uptime check: config present and database answering. No secrets or details leak. */
export async function GET() {
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
  const ok = envOk && dbOk && !features.includes("ANTHROPIC_API_KEY");
  return Response.json({ ok, config: envOk, database: dbOk, ai: !features.includes("ANTHROPIC_API_KEY"), email: !features.includes("RESEND_API_KEY") }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

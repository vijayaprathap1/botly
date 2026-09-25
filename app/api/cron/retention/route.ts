import { cronAuthorized } from "@/lib/cron";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nightly: delete conversations and leads older than each client's retention setting. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const { data, error } = await supabaseAdmin().rpc("purge_expired_data");
  if (error) {
    console.error("[cron/retention]", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  console.log("[cron/retention] purged", data);
  return Response.json({ ok: true, purged: data });
}

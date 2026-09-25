import { cronAuthorized } from "@/lib/cron";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendWeeklyReports } from "@/lib/weekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Mondays 09:00 IST: weekly summary email for Growth-plan clients. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  try {
    const r = await sendWeeklyReports(supabaseAdmin());
    console.log("[cron/weekly]", r);
    return Response.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron/weekly]", e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 500 });
  }
}

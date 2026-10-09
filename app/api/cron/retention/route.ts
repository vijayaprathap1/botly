import { cronAuthorized } from "@/lib/cron";
import { sweepDemos } from "@/lib/demo/service";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendTrialEmails } from "@/lib/trial-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily (9 am IST): delete data past each client's retention, then send trial lifecycle emails. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const { data, error } = await supabaseAdmin().rpc("purge_expired_data");
  if (error) {
    console.error("[cron/retention]", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  console.log("[cron/retention] purged", data);
  const trial = await sendTrialEmails(supabaseAdmin()).catch((e) => {
    console.error("[cron/trial-emails]", e instanceof Error ? e.message : e);
    return { sent: 0, skipped: 0 };
  });
  // Demos: expire the ones past their date, and delete them for good 30 days later.
  const demos = await sweepDemos(supabaseAdmin()).catch((e) => {
    console.error("[cron/demos]", e instanceof Error ? e.message : e);
    return { expired: 0, deleted: 0 };
  });
  return Response.json({ ok: true, purged: data, trialEmails: trial, demos });
}

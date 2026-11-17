import { after } from "next/server";
import { createBooking, getBookingSlots, type BookingApiDeps } from "@/lib/booking/api";
import { notifyNewBooking } from "@/lib/booking/notify";
import { insertAppointment, SupabaseBookingSource } from "@/lib/booking/service";
import { SupabaseStore } from "@/lib/chat/supabase-store";
import { clientIp, json, preflight, readJsonBody } from "@/lib/http";
import { PostgresRateLimiter } from "@/lib/security/rate-limit";
import { requestOrigin } from "@/lib/security/origin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

function deps(): BookingApiDeps {
  const db = supabaseAdmin();
  return {
    store: new SupabaseStore(db),
    source: new SupabaseBookingSource(db),
    limiter: new PostgresRateLimiter(db),
    insert: (row) => insertAppointment(db, row),
    notify: async (a, bot, s) => {
      const sent = await notifyNewBooking(a, bot, s);
      const stamp = new Date().toISOString();
      const patch = { ...(sent.business ? { business_notified_at: stamp } : {}), ...(sent.customer ? { customer_notified_at: stamp } : {}) };
      if (Object.keys(patch).length) await db.from("appointments").update(patch).eq("id", a.id);
    },
  };
}

/** Free times for a service: GET /api/widget/booking?key=…&service=…&date=YYYY-MM-DD */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url).searchParams;
    const r = await getBookingSlots(deps(), { key: u.get("key"), testToken: u.get("t"), service: u.get("service"), date: u.get("date") }, requestOrigin(req), clientIp(req));
    return json(req, r.body, r.status, { "Cache-Control": "no-store" });
  } catch (e) {
    console.error("[api/widget/booking GET]", e instanceof Error ? e.message : e);
    return json(req, { ok: false, error: "Couldn't load times. Please try again." }, 503);
  }
}

/** Book a time: POST /api/widget/booking (JSON as text/plain, like the lead form). */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(req, { ok: false, error: "Invalid request" }, 400);
  }
  try {
    const r = await createBooking(deps(), body, requestOrigin(req), clientIp(req));
    for (const job of r.jobs ?? []) after(() => job().catch((e) => console.error("[api/widget/booking] notify", e)));
    return json(req, r.body, r.status);
  } catch (e) {
    console.error("[api/widget/booking POST]", e instanceof Error ? e.message : e);
    return json(req, { ok: false, error: "Couldn't book right now. Please try again in a minute." }, 503);
  }
}

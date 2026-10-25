import { trackAppliedBillingEvent, trackPaymentFailed } from "@/lib/analytics/billing";
import { activateSubscription, applySubscription, isPaidActive } from "@/lib/billing/apply";
import { verifyWebhookSignature, type RzpSubscription } from "@/lib/billing/razorpay";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook (Dashboard → Webhooks → URL https://YOUR_DOMAIN/api/billing/webhook,
 * secret = RAZORPAY_WEBHOOK_SECRET, events: subscription.*). Idempotent by event id.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, sig)) return new Response("Invalid signature", { status: 400 });
  let evt: { event?: string; payload?: { subscription?: { entity?: RzpSubscription }; payment?: { entity?: { subscription_id?: string; error_reason?: string; error_description?: string; notes?: { org_id?: string } } } } };
  try {
    evt = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const eventId = req.headers.get("x-razorpay-event-id") ?? `${evt.event}:${Date.now()}`;
  const sub = evt.payload?.subscription?.entity;
  const db = supabaseAdmin();
  const orgId = sub?.notes?.org_id;
  const { error: dup } = await db.from("billing_events").insert({ id: eventId, org_id: orgId && /^[0-9a-f-]{36}$/i.test(orgId) ? orgId : null, event: evt.event ?? "unknown", payload: evt });
  if (dup?.code === "23505") return Response.json({ ok: true, duplicate: true });
  let applied: { orgId: string; orgPlan: string | null } | null = null;
  if (sub && orgId && /^[0-9a-f-]{36}$/i.test(orgId)) {
    try {
      const { data: org } = await db.from("organizations").select("razorpay_subscription_id, plan").eq("id", orgId).maybeSingle();
      const sameSubscription = Boolean(org && org.razorpay_subscription_id === sub.id);
      if (sameSubscription) await applySubscription(db, orgId, sub);
      // A different subscription that is now paid = first payment or plan switch whose
      // checkout callback never reached us. Anything else (old, replaced, abandoned) is ignored.
      else if (org && isPaidActive(sub)) await activateSubscription(db, orgId, sub);
      if (org && (sameSubscription || isPaidActive(sub))) applied = { orgId, orgPlan: (org.plan as string | null) ?? null };
    } catch (e) {
      // Let Razorpay retry: forget the event so the retry isn't treated as a duplicate.
      console.error("[billing] webhook apply failed", evt.event, e instanceof Error ? e.message : e);
      await db.from("billing_events").delete().eq("id", eventId);
      return new Response("Retry later", { status: 500 });
    }
  }
  if (applied && sub) {
    await trackAppliedBillingEvent({
      event: evt.event,
      orgId: applied.orgId,
      orgPlan: applied.orgPlan,
      subscriptionId: sub.id,
      razorpayPlanId: sub.plan_id,
    });
  } else if (evt.event === "payment.failed") {
    await trackPaymentFailed(db, evt.payload?.payment?.entity);
  }
  return Response.json({ ok: true });
}

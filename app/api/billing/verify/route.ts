import { z } from "zod";
import { getSession } from "@/lib/auth";
import { applySubscription } from "@/lib/billing/apply";
import { fetchSubscription, verifyPaymentSignature } from "@/lib/billing/razorpay";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  orgId: z.string().uuid(),
  razorpay_payment_id: z.string().min(5).max(100),
  razorpay_subscription_id: z.string().min(5).max(100),
  razorpay_signature: z.string().min(10).max(200),
});

/** Called by the browser right after Razorpay Checkout succeeds. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ ok: false, error: "Sign in first" }, { status: 401 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false, error: "Bad request" }, { status: 400 });
  const { orgId, razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = p.data;
  if (!session.orgIds.includes(orgId) && !session.isAdmin) return Response.json({ ok: false }, { status: 403 });
  const db = supabaseAdmin();
  const { data: org } = await db.from("organizations").select("razorpay_subscription_id").eq("id", orgId).single();
  // The subscription id must be the one WE created for this workspace (per Razorpay's docs).
  if (!org || org.razorpay_subscription_id !== razorpay_subscription_id) return Response.json({ ok: false, error: "Unknown subscription" }, { status: 400 });
  if (!verifyPaymentSignature(razorpay_payment_id, org.razorpay_subscription_id, razorpay_signature)) {
    return Response.json({ ok: false, error: "Payment could not be verified" }, { status: 400 });
  }
  const sub = await fetchSubscription(razorpay_subscription_id);
  // Mandate authorised: activate now; the webhook confirms charges and renewals.
  await applySubscription(db, orgId, sub.status === "created" ? { ...sub, status: "authenticated" } : sub);
  return Response.json({ ok: true });
}

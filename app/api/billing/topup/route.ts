import { z } from "zod";
import { getSession } from "@/lib/auth";
import { fetchOrder, verifyOrderSignature } from "@/lib/billing/razorpay";
import { applyTopupOrder } from "@/lib/billing/topup";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  orgId: z.string().uuid(),
  razorpay_payment_id: z.string().min(5).max(100),
  razorpay_order_id: z.string().min(5).max(100),
  razorpay_signature: z.string().min(10).max(200),
});

/** Called by the browser right after a top-up checkout succeeds. The webhook (order.paid) is the backup. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ ok: false, error: "Sign in first" }, { status: 401 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false, error: "Bad request" }, { status: 400 });
  const { orgId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = p.data;
  if (!session.orgIds.includes(orgId) && !session.isAdmin) return Response.json({ ok: false }, { status: 403 });
  if (!verifyOrderSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return Response.json({ ok: false, error: "Payment could not be verified" }, { status: 400 });
  }
  let order;
  try {
    order = await fetchOrder(razorpay_order_id);
    // Capture can lag the checkout by a moment: look twice more before deferring to the webhook.
    for (let i = 0; i < 2 && order.status !== "paid"; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      order = await fetchOrder(razorpay_order_id).catch(() => order!);
    }
  } catch (e) {
    console.error("[billing] topup fetch", e instanceof Error ? e.message : e);
    return Response.json({ ok: false, error: "We couldn't confirm the payment yet. It will update within a few minutes." }, { status: 502 });
  }
  const result = await applyTopupOrder(supabaseAdmin(), order, razorpay_payment_id, orgId);
  if (result === "invalid") return Response.json({ ok: false, error: "Unknown order" }, { status: 400 });
  return Response.json({ ok: true, pending: result === "not_paid" });
}

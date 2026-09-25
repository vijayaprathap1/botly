import type { SupabaseClient } from "@supabase/supabase-js";
import { plans } from "../plans";
import type { Plan } from "../types";
import type { RzpSubscription } from "./razorpay";

/** Maps a Razorpay plan id back to our plan. */
export function planForRazorpayPlan(planId: string): Plan | null {
  for (const p of Object.values(plans())) {
    if (p.razorpayPlanEnv && process.env[p.razorpayPlanEnv] === planId) return p.id;
  }
  return null;
}

/**
 * Brings an organization in line with its Razorpay subscription. Paid and active →
 * that plan's quota; ended/halted → service stops (visitors see contact details).
 */
export async function applySubscription(db: SupabaseClient, orgId: string, sub: RzpSubscription): Promise<void> {
  const plan = planForRazorpayPlan(sub.plan_id);
  const periodEnd = sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null;
  const base = { razorpay_subscription_id: sub.id, razorpay_plan_id: sub.plan_id, current_period_end: periodEnd };
  if ((sub.status === "active" || sub.status === "authenticated") && plan && plan !== "trial") {
    await db
      .from("organizations")
      .update({ ...base, plan, subscription_status: "active", monthly_conversation_quota: plans()[plan].conversations, suspended: false, cancel_at_period_end: false })
      .eq("id", orgId);
    return;
  }
  if (sub.status === "pending") {
    // Renewal payment failed; Razorpay retries. Keep the service on for now.
    await db.from("organizations").update({ ...base, subscription_status: "past_due" }).eq("id", orgId);
    return;
  }
  if (sub.status === "halted" || sub.status === "cancelled" || sub.status === "completed" || sub.status === "expired") {
    await db
      .from("organizations")
      .update({
        ...base,
        subscription_status: sub.status === "halted" ? "halted" : sub.status === "cancelled" ? "cancelled" : "expired",
        // Service off: behaves like an ended trial until they subscribe again.
        plan: "trial",
        trial_ends_at: new Date().toISOString(),
        trial_reply_limit: 0,
        cancel_at_period_end: false,
      })
      .eq("id", orgId);
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { FOUNDING, plans, razorpayPlanIds, type PaidPlan } from "../plans";
import type { BillingInterval } from "../types";
import { cancelSubscription, type RzpSubscription } from "./razorpay";

/** Which of our plans a Razorpay plan id sells (monthly, yearly or the founding price), from env. */
export function razorpayPlanInfo(planId: string): { plan: PaidPlan; interval: BillingInterval; founding: boolean } | null {
  if (!planId) return null;
  const hit = razorpayPlanIds().find((p) => p.id === planId);
  return hit ? { plan: hit.plan, interval: hit.interval, founding: hit.founding } : null;
}

/** Maps a Razorpay plan id back to our plan. */
export function planForRazorpayPlan(planId: string): PaidPlan | null {
  return razorpayPlanInfo(planId)?.plan ?? null;
}

/**
 * Only an `active` subscription has been charged. `authenticated` means the mandate is set
 * up but no payment has gone through yet (and `created` not even that), so neither unlocks
 * a paid plan. Razorpay moves the subscription to `active` (subscription.activated /
 * subscription.charged) once the first charge succeeds.
 */
export const isPaidStatus = (status: RzpSubscription["status"]) => status === "active";

/**
 * Brings an organization in line with its Razorpay subscription. Paid and active →
 * that plan's quota; ended/halted → back to the Free plan (50 conversations a month).
 * Not yet paid (created/authenticated) → nothing changes. Safe to apply the same
 * state twice, and an out-of-order `authenticated` event never undoes `active`.
 */
export async function applySubscription(db: SupabaseClient, orgId: string, sub: RzpSubscription): Promise<void> {
  const info = razorpayPlanInfo(sub.plan_id);
  const plan = info?.plan ?? null;
  const periodEnd = sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null;
  const base = { razorpay_subscription_id: sub.id, razorpay_plan_id: sub.plan_id, current_period_end: periodEnd };
  if (isPaidStatus(sub.status) && plan) {
    await db
      .from("organizations")
      .update({ ...base, plan, subscription_status: "active", monthly_conversation_quota: plans()[plan].conversations, suspended: false, cancel_at_period_end: false })
      .eq("id", orgId);
    // Founding price: count the slot (idempotent) and record the 12-month lock.
    if (info?.founding) {
      const { error } = await db.rpc("confirm_founding_slot", { p_org_id: orgId, p_subscription_id: sub.id, p_lock_months: FOUNDING.lockMonths });
      if (error) console.error("[billing] founding confirm", error.message);
    }
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
        // Paid service ended: the workspace keeps working on the Free plan.
        plan: "free",
        monthly_conversation_quota: plans().free.conversations,
        cancel_at_period_end: false,
      })
      .eq("id", orgId);
  }
}

export const isPaidActive = (sub: RzpSubscription) => isPaidStatus(sub.status) && Boolean(planForRazorpayPlan(sub.plan_id));

/**
 * A newly paid subscription becomes the workspace's subscription. Returns false (and
 * changes nothing) while the subscription isn't charged yet. If it replaces an
 * earlier one (plan switch), that one is cancelled now, so the customer is never billed
 * for both. Only called after the payment signature or webhook signature is verified.
 */
export async function activateSubscription(db: SupabaseClient, orgId: string, sub: RzpSubscription): Promise<boolean> {
  // Not charged yet: keep the current plan (and any subscription it replaces) untouched.
  // The webhook activates it when Razorpay reports the first successful charge.
  if (!isPaidActive(sub)) return false;
  const { data: org } = await db.from("organizations").select("razorpay_subscription_id").eq("id", orgId).maybeSingle();
  const previous = [sub.notes?.replaces, org?.razorpay_subscription_id].filter((id): id is string => Boolean(id) && id !== sub.id);
  await applySubscription(db, orgId, sub);
  for (const id of new Set(previous)) {
    await cancelSubscription(id, false).catch((e) => console.warn("[billing] couldn't cancel replaced subscription", id, e instanceof Error ? e.message : e));
  }
  return true;
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planForRazorpayPlan } from "../billing/apply";
import { plans } from "../plans";
import { billingTrackFor } from "./billing-events";
import { track } from "./track";

function paidPlan(razorpayPlanId: string | null | undefined, orgPlan: string | null | undefined): "starter" | "growth" | null {
  const mapped = razorpayPlanId ? planForRazorpayPlan(razorpayPlanId) : null;
  if (mapped === "starter" || mapped === "growth") return mapped;
  if (orgPlan === "starter" || orgPlan === "growth") return orgPlan;
  return null;
}

function amountInr(plan: "starter" | "growth"): number {
  return plans()[plan].priceInr;
}

/**
 * After a webhook has updated the organization, record the matching growth event.
 * Activation is stored once per Razorpay subscription (the table ignores duplicates).
 */
export async function trackAppliedBillingEvent(args: {
  event: string | null | undefined;
  orgId: string;
  orgPlan: string | null;
  subscriptionId: string;
  razorpayPlanId: string | null;
  errorReason?: string | null;
}): Promise<void> {
  const decision = billingTrackFor(args.event, { errorReason: args.errorReason });
  if (!decision) return;
  const plan = paidPlan(args.razorpayPlanId, args.orgPlan);
  if (decision.name === "subscription_activated") {
    if (!plan) return;
    await track({
      name: "subscription_activated",
      orgId: args.orgId,
      properties: { plan, amount_inr: amountInr(plan), razorpay_subscription_id: args.subscriptionId },
    });
    return;
  }
  await track({
    name: decision.name,
    orgId: args.orgId,
    properties: { ...(plan ? { plan } : {}), reason: decision.reason },
  });
}

type PaymentEntity = {
  subscription_id?: string;
  error_reason?: string;
  error_description?: string;
  notes?: { org_id?: string };
};

/**
 * payment.failed often has no subscription entity. Resolve the workspace from
 * the payment notes or the subscription id, then record it. Never throws.
 */
export async function trackPaymentFailed(db: SupabaseClient, payment: PaymentEntity | null | undefined): Promise<void> {
  try {
    if (!payment) return;
    let orgId = payment.notes?.org_id ?? null;
    let orgPlan: string | null = null;
    if ((!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) && payment.subscription_id) {
      const { data } = await db.from("organizations").select("id, plan").eq("razorpay_subscription_id", payment.subscription_id).maybeSingle();
      orgId = (data?.id as string | undefined) ?? null;
      orgPlan = (data?.plan as string | undefined) ?? null;
    }
    if (!orgId) return;
    await trackAppliedBillingEvent({
      event: "payment.failed",
      orgId,
      orgPlan,
      subscriptionId: payment.subscription_id ?? "",
      razorpayPlanId: null,
      errorReason: payment.error_reason || payment.error_description || null,
    });
  } catch (e) {
    console.error("[analytics] payment_failed", e instanceof Error ? e.message : e);
  }
}

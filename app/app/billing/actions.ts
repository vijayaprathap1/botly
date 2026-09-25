"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { cancelSubscription, createSubscription, razorpayConfigured } from "@/lib/billing/razorpay";
import { plans } from "@/lib/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type CheckoutResult = { error?: string; subscriptionId?: string; keyId?: string; email?: string | null; name?: string; plan?: string } | null;

async function ownedOrg(orgId: string) {
  const session = await requireSession();
  if (!session.orgIds.includes(orgId) && !session.isAdmin) throw new Error("Not allowed");
  const { data: org } = await supabaseAdmin().from("organizations").select("*").eq("id", orgId).single();
  return { session, org };
}

/** Creates a Razorpay subscription for the chosen plan; the browser then opens Razorpay Checkout. */
export async function startCheckout(orgId: string, planId: "starter" | "growth"): Promise<CheckoutResult> {
  const { session, org } = await ownedOrg(orgId);
  if (!org) return { error: "Workspace not found" };
  if (!razorpayConfigured()) return { error: "Payments aren't set up yet. Please contact support to upgrade." };
  const def = plans()[planId];
  const rzpPlan = def.razorpayPlanEnv ? process.env[def.razorpayPlanEnv] : undefined;
  if (!rzpPlan) return { error: `The ${def.name} plan isn't configured yet. Please contact support.` };
  if (org.subscription_status === "active" && org.razorpay_plan_id === rzpPlan) return { error: `You're already on ${def.name}.` };
  try {
    // Switching plans: cancel the old subscription at the end of its paid period.
    if (org.razorpay_subscription_id && org.subscription_status === "active") {
      await cancelSubscription(org.razorpay_subscription_id, true).catch(() => {});
    }
    const sub = await createSubscription({ planId: rzpPlan, orgId, email: org.billing_email ?? session.email });
    await supabaseAdmin().from("organizations").update({ razorpay_subscription_id: sub.id, subscription_status: org.subscription_status === "active" ? "active" : "pending" }).eq("id", orgId);
    return { subscriptionId: sub.id, keyId: process.env.RAZORPAY_KEY_ID!, email: org.billing_email ?? session.email, name: org.name, plan: def.name };
  } catch (e) {
    console.error("[billing] checkout", e instanceof Error ? e.message : e);
    return { error: "Couldn't start the payment. Please try again in a minute." };
  }
}

export async function cancelPlan(orgId: string): Promise<{ error?: string; ok?: boolean }> {
  const { org } = await ownedOrg(orgId);
  if (!org?.razorpay_subscription_id) return { error: "No active subscription" };
  try {
    await cancelSubscription(org.razorpay_subscription_id, true);
    await supabaseAdmin().from("organizations").update({ cancel_at_period_end: true }).eq("id", orgId);
    revalidatePath("/app/billing");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't cancel" };
  }
}

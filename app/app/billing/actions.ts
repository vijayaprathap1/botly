"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { reserveFoundingSlot } from "@/lib/billing/founding";
import { cancelSubscription, createOrder, createSubscription, fetchPlan, planMismatch, razorpayConfigured } from "@/lib/billing/razorpay";
import { topupNotes } from "@/lib/billing/topup";
import { FOUNDING, isPaidPlan, plans, razorpayPlanEnv, TOPUP, type PaidPlan } from "@/lib/plans";
import { monthKey } from "@/lib/quota";
import type { BillingInterval } from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase/admin";

import type { ActionState } from "@/app/app/actions";

/** Name and email printed on invoices. */
export async function saveBillingDetails(orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { org } = await ownedOrg(orgId);
  if (!org) return { error: "Workspace not found" };
  const name = String(form.get("billing_name") ?? "").trim().slice(0, 120);
  const email = String(form.get("billing_email") ?? "").trim().toLowerCase().slice(0, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid billing email." };
  const { error } = await supabaseAdmin().from("organizations").update({ billing_name: name || null, billing_email: email || null }).eq("id", orgId);
  if (error) return { error: error.message };
  revalidatePath("/app/billing");
  return { ok: true, message: "Saved. New invoices will use these details." };
}

export type CheckoutResult = { error?: string; subscriptionId?: string; keyId?: string; email?: string | null; name?: string; plan?: string } | null;

async function ownedOrg(orgId: string) {
  const session = await requireSession();
  if (!session.orgIds.includes(orgId) && !session.isAdmin) throw new Error("Not allowed");
  const { data: org } = await supabaseAdmin().from("organizations").select("*").eq("id", orgId).single();
  return { session, org };
}

/**
 * Creates a Razorpay subscription for the chosen plan and interval; the browser then opens
 * Razorpay Checkout. `founding` = the founding price (Growth, monthly) while slots last.
 */
export async function startCheckout(orgId: string, planId: PaidPlan, interval: BillingInterval = "monthly", founding = false): Promise<CheckoutResult> {
  const { session, org } = await ownedOrg(orgId);
  if (!org) return { error: "Workspace not found" };
  if (!isPaidPlan(planId) || (interval !== "monthly" && interval !== "yearly")) return { error: "Unknown plan" };
  if (!razorpayConfigured()) return { error: "Payments aren't set up yet. Please contact support to upgrade." };
  const def = plans()[planId];
  let rzpPlan: string | undefined;
  if (founding) {
    if (planId !== FOUNDING.plan || interval !== "monthly") return { error: "The founding price is for Growth, billed monthly." };
    rzpPlan = process.env[FOUNDING.razorpayPlanEnv];
    if (!rzpPlan) return { error: "The founding offer isn't open for online payment yet. Please contact us to claim it." };
  } else {
    rzpPlan = process.env[razorpayPlanEnv(planId, interval)];
  }
  if (!rzpPlan) return { error: `${def.name} (${interval}) isn't configured yet. Please contact support.` };
  if (org.subscription_status === "active" && org.razorpay_plan_id === rzpPlan) return { error: `You're already on ${def.name}.` };
  // Never charge a price other than the one on the page (e.g. env still points at an old plan).
  const amountInr = founding ? FOUNDING.priceInr : interval === "yearly" ? def.yearlyInr : def.priceInr;
  try {
    const problem = planMismatch(await fetchPlan(rzpPlan), { amountInr, yearly: interval === "yearly" });
    if (problem) {
      console.error(`[billing] refusing checkout: ${def.name} ${interval}${founding ? " founding" : ""}: ${problem}`);
      return { error: `${def.name} isn't available for online payment right now. Please contact support.` };
    }
  } catch (e) {
    console.error("[billing] plan check", e instanceof Error ? e.message : e);
    return { error: "Couldn't start the payment. Please try again in a minute." };
  }
  // Hold a founding slot while they pay (atomic; the 26th shop is turned away here).
  if (founding && !(await reserveFoundingSlot(supabaseAdmin(), orgId))) return { error: "All founding slots have been taken. The regular Growth price still applies." };
  try {
    // Nothing changes on our side until Razorpay confirms payment (verify route or webhook):
    // a closed checkout must never cancel or replace the plan the customer already has.
    const current = org.subscription_status === "active" && org.razorpay_subscription_id ? org.razorpay_subscription_id : undefined;
    const sub = await createSubscription({ planId: rzpPlan, orgId, email: org.billing_email ?? session.email, replaces: current, billingName: org.billing_name ?? undefined, yearly: interval === "yearly", founding });
    return { subscriptionId: sub.id, keyId: process.env.RAZORPAY_KEY_ID!, email: org.billing_email ?? session.email, name: org.name, plan: def.name };
  } catch (e) {
    console.error("[billing] checkout", e instanceof Error ? e.message : e);
    return { error: "Couldn't start the payment. Please try again in a minute." };
  }
}

export type TopupCheckout = { error?: string; orderId?: string; keyId?: string; amount?: number; email?: string | null; name?: string; description?: string } | null;

/** One-time Razorpay order for a top-up pack (+500 conversations this month). */
export async function startTopup(orgId: string): Promise<TopupCheckout> {
  const { session, org } = await ownedOrg(orgId);
  if (!org) return { error: "Workspace not found" };
  if (org.plan === "trial") return { error: "Top-ups are for the Free and paid plans. Pick a plan first." };
  if (org.suspended) return { error: "This workspace is paused. Please contact support." };
  if (!razorpayConfigured()) return { error: "Payments aren't set up yet. Please contact support." };
  const month = monthKey(new Date(), org.timezone || "Asia/Kolkata");
  try {
    const order = await createOrder({ amountPaise: TOPUP.priceInr * 100, receipt: `topup_${orgId.slice(0, 8)}_${Date.now()}`, notes: topupNotes(orgId, month) });
    return {
      orderId: order.id,
      keyId: process.env.RAZORPAY_KEY_ID!,
      amount: order.amount,
      email: org.billing_email ?? session.email,
      name: org.name,
      description: `${TOPUP.conversations.toLocaleString("en-IN")} more conversations this month`,
    };
  } catch (e) {
    console.error("[billing] topup", e instanceof Error ? e.message : e);
    return { error: "Couldn't start the payment. Please try again in a minute." };
  }
}

/** A workspace without a paid subscription (e.g. an ended trial) moves to the Free plan. */
export async function switchToFree(orgId: string): Promise<{ error?: string; ok?: boolean }> {
  const { org } = await ownedOrg(orgId);
  if (!org) return { error: "Workspace not found" };
  if (org.subscription_status === "active") return { error: "Cancel your paid plan first; you move to Free when it ends." };
  if (org.plan === "free") return { ok: true };
  const { error } = await supabaseAdmin()
    .from("organizations")
    .update({ plan: "free", monthly_conversation_quota: plans().free.conversations, subscription_status: "none" })
    .eq("id", orgId);
  if (error) return { error: "Couldn't switch plans. Please try again." };
  revalidatePath("/app", "layout");
  return { ok: true };
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

"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { cancelSubscription, createSubscription, razorpayConfigured } from "@/lib/billing/razorpay";
import { plans } from "@/lib/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";

import type { ActionState } from "@/app/app/actions";

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Name, GSTIN and email printed on invoices. GSTIN is checked for shape (15 characters). */
export async function saveBillingDetails(orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { org } = await ownedOrg(orgId);
  if (!org) return { error: "Workspace not found" };
  const name = String(form.get("billing_name") ?? "").trim().slice(0, 120);
  const gstin = String(form.get("gstin") ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const email = String(form.get("billing_email") ?? "").trim().toLowerCase().slice(0, 200);
  if (gstin && !GSTIN.test(gstin)) return { error: "That GSTIN doesn't look right. It has 15 characters, like 33ABCDE1234F1Z5." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid billing email." };
  const { error } = await supabaseAdmin().from("organizations").update({ billing_name: name || null, gstin: gstin || null, billing_email: email || null }).eq("id", orgId);
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
    // Nothing changes on our side until Razorpay confirms payment (verify route or webhook):
    // a closed checkout must never cancel or replace the plan the customer already has.
    const current = org.subscription_status === "active" && org.razorpay_subscription_id ? org.razorpay_subscription_id : undefined;
    const sub = await createSubscription({ planId: rzpPlan, orgId, email: org.billing_email ?? session.email, replaces: current, gstin: org.gstin ?? undefined, billingName: org.billing_name ?? undefined });
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

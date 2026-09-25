"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { plans } from "@/lib/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";

const uuid = z.string().uuid();

/** Super admin: extend a trial, set a plan manually (offline/done-for-you clients), suspend. */
export async function adminOrgAction(form: FormData) {
  await requireAdmin();
  const orgId = String(form.get("orgId") ?? "");
  const action = String(form.get("action") ?? "");
  if (!uuid.safeParse(orgId).success) return;
  const db = supabaseAdmin();
  const { data: org } = await db.from("organizations").select("plan, trial_ends_at, trial_reply_limit, trial_replies_used").eq("id", orgId).single();
  if (!org) return;
  if (action === "extend") {
    const base = Math.max(Date.now(), org.trial_ends_at ? new Date(org.trial_ends_at).getTime() : 0);
    await db
      .from("organizations")
      .update({ plan: "trial", subscription_status: "trialing", trial_ends_at: new Date(base + 7 * 86_400_000).toISOString(), trial_reply_limit: Math.max(org.trial_reply_limit, org.trial_replies_used) + 50 })
      .eq("id", orgId);
  } else if (action === "starter" || action === "growth") {
    await db.from("organizations").update({ plan: action, subscription_status: "active", monthly_conversation_quota: plans()[action].conversations, suspended: false }).eq("id", orgId);
  } else if (action === "suspend") {
    await db.from("organizations").update({ suspended: true, suspended_reason: String(form.get("reason") ?? "").slice(0, 200) || "Suspended by admin" }).eq("id", orgId);
  } else if (action === "unsuspend") {
    await db.from("organizations").update({ suspended: false, suspended_reason: null }).eq("id", orgId);
  }
  revalidatePath("/app/admin");
}

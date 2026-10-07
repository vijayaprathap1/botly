import "server-only";
import { config } from "./config";
import { supabaseAdmin } from "./supabase/admin";

/** Where a `next` parameter may send someone after sign-in: inside the dashboard, or sign-up. */
export function safeNext(next: string | null | undefined): string {
  return next && (next.startsWith("/app") || next === "/start") ? next : "/app";
}

/**
 * Runs once a session exists, however the user signed in (Google, the emailed link):
 * accepts client invites, makes ADMIN_EMAILS addresses platform admins, and decides
 * where to land. Brand-new customers with no workspace go to sign-up onboarding.
 */
export async function landAfterSignIn(user: { id: string; email?: string | null }, next: string | null | undefined): Promise<string> {
  const email = user.email?.toLowerCase();
  const admin = supabaseAdmin();
  if (email) {
    // Client (owner) invites: grant access to their business on first sign-in.
    const { error } = await admin.rpc("accept_invites", { p_user_id: user.id, p_email: email });
    if (error) console.error("[auth] accept invites", error.message);
  }
  if (email && config.adminEmails.includes(email)) {
    const { data: existing } = await admin.from("memberships").select("id").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!existing) await admin.from("memberships").insert({ user_id: user.id, org_id: null, role: "admin" });
  }
  const { data: rows } = await admin.from("memberships").select("role").eq("user_id", user.id).limit(1);
  if (!rows?.length) return "/start";
  return safeNext(next);
}

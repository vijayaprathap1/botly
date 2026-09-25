import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

/** Magic-link landing: exchange the code for a session; first sign-in by an ADMIN_EMAILS address becomes admin. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/app";
  const next = nextParam.startsWith("/app") || nextParam === "/start" ? nextParam : "/app";
  if (!code) return NextResponse.redirect(new URL("/login?error=1", url.origin));

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(new URL("/login?error=1", url.origin));

  const email = data.user.email?.toLowerCase();
  if (email) {
    // Client (owner) invites: grant access to their business on first sign-in.
    const { error: invErr } = await supabaseAdmin().rpc("accept_invites", { p_user_id: data.user.id, p_email: email });
    if (invErr) console.error("[auth] accept invites", invErr.message);
  }
  if (email && config.adminEmails.includes(email)) {
    const admin = supabaseAdmin();
    const { data: existing } = await admin.from("memberships").select("id").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!existing) await admin.from("memberships").insert({ user_id: data.user.id, org_id: null, role: "admin" });
  }
  // Brand-new customers (no workspace yet, not a super admin) go to sign-up onboarding.
  const { data: rows } = await supabaseAdmin().from("memberships").select("role").eq("user_id", data.user.id).limit(1);
  if (!rows?.length) return NextResponse.redirect(new URL("/start", url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}

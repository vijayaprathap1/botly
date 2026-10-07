"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { landAfterSignIn } from "@/lib/auth-landing";
import { supabaseServer } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];

/** The button on /auth/confirm: trades the emailed one-time token for a session. */
export async function confirmSignIn(form: FormData) {
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "email") as EmailOtpType;
  const next = String(form.get("next") ?? "");
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(tokenHash) || !TYPES.includes(type)) redirect("/login?error=1");

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) {
    console.warn("[auth/confirm]", error?.message ?? "no user");
    redirect("/login?error=1");
  }
  redirect(await landAfterSignIn(data.user, next));
}

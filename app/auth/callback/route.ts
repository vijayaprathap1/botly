import { NextResponse } from "next/server";
import { landAfterSignIn } from "@/lib/auth-landing";
import { supabaseServer } from "@/lib/supabase/server";

/** OAuth (Google) landing: exchange the code for a session, then send the user to the right place. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=1", url.origin));

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(new URL("/login?error=1", url.origin));

  return NextResponse.redirect(new URL(await landAfterSignIn(data.user, url.searchParams.get("next")), url.origin));
}

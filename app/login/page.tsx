import type { Metadata } from "next";
import { AuthShell } from "@/components/marketing/auth-shell";
import { LoginForm, OAuthButtons } from "./login-form";

type LoginQuery = { next?: string; error?: string; signup?: string; plan?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<LoginQuery> }): Promise<Metadata> {
  const sp = await searchParams;
  return { title: sp.signup ? "Start your free trial" : "Sign in" };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<LoginQuery> }) {
  const sp = await searchParams;
  // Pricing links add plan=trial|starter|growth. Any other value is ignored; sign-in is unchanged.
  const plan = sp.plan === "trial" || sp.plan === "starter" || sp.plan === "growth" ? sp.plan : undefined;
  const next = sp.next?.startsWith("/app") ? sp.next : "/app";
  // Providers you've enabled in Supabase → Authentication → Sign In / Providers.
  const providers = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "google").split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <AuthShell>
      <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-zinc-950" data-plan={plan ?? undefined}>{sp.signup ? "Start your free trial" : "Welcome back"}</h1>
      <p className="mt-2 text-[14.5px] text-zinc-500">{sp.signup ? "Create your account. No password or card needed." : "Sign in to your Botly account. New here? This creates your free account."}</p>
      {sp.error ? <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13.5px] text-red-800" role="alert">That link didn&apos;t work or has expired. Please try again.</p> : null}
      <OAuthButtons providers={providers} next={next} />
      <LoginForm next={next} />
      <p className="mt-8 text-[12.5px] leading-relaxed text-zinc-500">
        By continuing you agree to the <a className="font-medium text-zinc-700 underline underline-offset-2" href="/terms">Terms</a> and <a className="font-medium text-zinc-700 underline underline-offset-2" href="/privacy-policy">Privacy Policy</a>.
      </p>
    </AuthShell>
  );
}

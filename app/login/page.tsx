import type { Metadata } from "next";
import { LoginForm, OAuthButtons } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; signup?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith("/app") ? sp.next : "/app";
  // Providers you've enabled in Supabase → Authentication → Sign In / Providers.
  const providers = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "google").split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <div className="mb-8 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">B</span>
        <span className="text-xl font-semibold">Botly</span>
      </div>
      <h1 className="text-2xl font-semibold">{sp.signup ? "Start your free trial" : "Sign in"}</h1>
      <p className="mt-1 text-sm text-slate-600">New here? Signing in creates your free account. No password or card needed.</p>
      {sp.error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">That link didn&apos;t work or expired. Try again.</p> : null}
      <OAuthButtons providers={providers} next={next} />
      <LoginForm next={next} />
      <p className="mt-6 text-xs text-slate-500">
        By continuing you agree to the <a className="underline" href="/terms">Terms</a> and <a className="underline" href="/privacy-policy">Privacy Policy</a>.
      </p>
    </main>
  );
}

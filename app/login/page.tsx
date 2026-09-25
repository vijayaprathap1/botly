import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <div className="mb-8 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">B</span>
        <span className="text-xl font-semibold">Botly</span>
      </div>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">We&apos;ll email you a sign-in link. No password needed.</p>
      {sp.error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">That link didn&apos;t work or expired. Try again.</p> : null}
      <LoginForm next={sp.next?.startsWith("/app") ? sp.next : "/app"} />
    </main>
  );
}

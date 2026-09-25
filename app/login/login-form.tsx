"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

const PROVIDER_LABEL: Record<string, string> = { google: "Google", azure: "Microsoft", github: "GitHub", facebook: "Facebook", linkedin_oidc: "LinkedIn", apple: "Apple" };

export function OAuthButtons({ providers, next }: { providers: string[]; next: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!providers.length) return null;
  return (
    <div className="mt-8 grid gap-2.5">
      {providers.map((p) => (
        <button
          key={p}
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy(p);
            setError("");
            const { error } = await supabaseBrowser().auth.signInWithOAuth({
              provider: p as "google",
              options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
            });
            if (error) {
              setError(`${PROVIDER_LABEL[p] ?? p} sign-in isn't available right now. Use email instead.`);
              setBusy(null);
            }
          }}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-200 bg-white text-[14.5px] font-medium text-zinc-900 shadow-[0_1px_2px_rgb(0_0_0/0.05)] transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
        >
          {p === "google" ? (
            <svg aria-hidden width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          ) : null}
          {busy === p ? "Opening…" : `Continue with ${PROVIDER_LABEL[p] ?? p}`}
        </button>
      ))}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="my-3 flex items-center gap-3 text-[12px] text-zinc-400"><span className="h-px flex-1 bg-zinc-200" />or continue with email<span className="h-px flex-1 bg-zinc-200" /></div>
    </div>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else setState("sent");
  }

  if (state === "sent")
    return (
      <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-[14px] text-zinc-700" role="status">
        <p className="font-semibold text-zinc-950">Check your email</p>
        <p className="mt-1">We sent a sign-in link to <b className="text-zinc-950">{email}</b>. Open it on this device. You can close this tab.</p>
      </div>
    );
  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3">
      <label className="block text-[13px] font-medium text-zinc-800" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="block h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-[15px] outline-none transition placeholder:text-zinc-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" placeholder="you@business.com"
      />
      {state === "error" ? <p className="text-[13px] text-red-700">{error}</p> : null}
      <button
        disabled={state === "sending"}
        className="flex h-11 w-full items-center justify-center rounded-lg bg-zinc-950 text-[14.5px] font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}

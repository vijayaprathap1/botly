import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/client";
import { AuthShell } from "@/components/marketing/auth-shell";
import { safeNext } from "@/lib/auth-landing";
import { confirmSignIn } from "./actions";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/**
 * Where the emailed sign-in button lands. The one-time token is only used when the
 * person presses the button here, so mail scanners that open links ahead of the user
 * can't burn it, and the link works on any device (not just the one that asked for it).
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; redirect_to?: string; next?: string }> }) {
  const sp = await searchParams;
  // The email template passes Supabase's RedirectTo (…/auth/callback?next=/app/…): keep only its `next`.
  let next = sp.next ?? "";
  if (!next && sp.redirect_to) {
    try {
      next = new URL(sp.redirect_to).searchParams.get("next") ?? "";
    } catch {
      /* not a URL: ignore */
    }
  }
  const valid = Boolean(sp.token_hash && /^[A-Za-z0-9_-]{16,200}$/.test(sp.token_hash));
  return (
    <AuthShell>
      {valid ? (
        <>
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-zinc-950">Sign in to Botly</h1>
          <p className="mt-2 text-[14.5px] text-zinc-500">One more step: press the button to finish signing in on this device.</p>
          <form action={confirmSignIn} className="mt-8">
            <input type="hidden" name="token_hash" value={sp.token_hash} />
            <input type="hidden" name="type" value={sp.type ?? "email"} />
            <input type="hidden" name="next" value={safeNext(next)} />
            <SubmitButton pendingText="Signing in…" className="flex h-11 w-full items-center justify-center rounded-lg bg-zinc-950 text-[14.5px] font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60">
              Sign in
            </SubmitButton>
          </form>
          <p className="mt-6 text-[12.5px] leading-relaxed text-zinc-500">Didn&apos;t ask to sign in? You can close this page; nothing happens unless you press the button.</p>
        </>
      ) : (
        <>
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-zinc-950">This link isn&apos;t valid</h1>
          <p className="mt-2 text-[14.5px] text-zinc-500">It may be incomplete or already used. Ask for a new sign-in link.</p>
          <Link href="/login" className="mt-8 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-950 text-[14.5px] font-medium text-white shadow-sm transition hover:bg-zinc-800">Back to sign in</Link>
        </>
      )}
    </AuthShell>
  );
}

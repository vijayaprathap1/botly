import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { btn, Logo } from "@/components/ui";

export default function NotFound() {
  const email = process.env.SUPPORT_EMAIL;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-5 text-center">
      <Link href="/" aria-label="Botly home"><Logo className="text-[17px]" /></Link>
      <p className="mt-10 font-mono text-[13px] font-medium text-brand-600">404</p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-zinc-950">This page doesn&apos;t exist</h1>
      <p className="mt-2 max-w-sm text-[15px] text-zinc-600">The link may be old or mistyped. If someone sent you a private test link, ask them for a fresh one.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Link href="/" className={btn.secondary}><ArrowLeft className="h-4 w-4" />Home</Link>
        <Link href="/app" className={btn.primary}>Go to your dashboard</Link>
      </div>
      {email ? <p className="mt-8 text-[13px] text-zinc-500">Need help? <a className="font-medium text-zinc-800 underline underline-offset-4" href={`mailto:${email}`}>{email}</a></p> : null}
    </main>
  );
}

import Link from "next/link";
import { Logo } from "@/components/ui";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white text-zinc-950">
      <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label="Botly home"><Logo className="text-[17px]" /></Link>
          <nav className="flex items-center gap-1 text-[14px]" aria-label="Main">
            <Link href="/#how" className="hidden rounded-md px-3 py-2 text-zinc-600 transition hover:text-zinc-950 md:inline">How it works</Link>
            <Link href="/#features" className="hidden rounded-md px-3 py-2 text-zinc-600 transition hover:text-zinc-950 md:inline">Features</Link>
            <Link href="/#pricing" className="rounded-md px-3 py-2 text-zinc-600 transition hover:text-zinc-950">Pricing</Link>
            <Link href="/login" className="hidden rounded-md px-3 py-2 text-zinc-600 transition hover:text-zinc-950 sm:inline">Sign in</Link>
            <Link href="/login?signup=1" className="ml-1 inline-flex h-9 items-center rounded-lg bg-zinc-950 px-4 font-medium text-white shadow-sm transition hover:bg-zinc-800">Start free</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t border-zinc-200/70 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-[13.5px] leading-relaxed text-zinc-500">AI customer support for Indian businesses. Answers in English, Tamil and Hindi, and sends you the leads.</p>
          </div>
          <div className="text-[13.5px]">
            <p className="font-medium text-zinc-900">Product</p>
            <ul className="mt-3 space-y-2 text-zinc-500">
              <li><Link className="hover:text-zinc-900" href="/#how">How it works</Link></li>
              <li><Link className="hover:text-zinc-900" href="/#pricing">Pricing</Link></li>
              <li><Link className="hover:text-zinc-900" href="/login?signup=1">Start free</Link></li>
            </ul>
          </div>
          <div className="text-[13.5px]">
            <p className="font-medium text-zinc-900">Company</p>
            <ul className="mt-3 space-y-2 text-zinc-500">
              <li><Link className="hover:text-zinc-900" href="/terms">Terms</Link></li>
              <li><Link className="hover:text-zinc-900" href="/privacy-policy">Privacy</Link></li>
              {process.env.SUPPORT_EMAIL ? <li><a className="hover:text-zinc-900" href={`mailto:${process.env.SUPPORT_EMAIL}`}>{process.env.SUPPORT_EMAIL}</a></li> : null}
            </ul>
          </div>
        </div>
        <div className="border-t border-zinc-100 py-5 text-center text-[12.5px] text-zinc-400">© {new Date().getFullYear()} {process.env.BUSINESS_LEGAL_NAME || "Botly"}. Made in India.</div>
      </footer>
    </div>
  );
}

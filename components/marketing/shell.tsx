import Link from "next/link";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">B</span>
            Botly
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/#how" className="hidden rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100 sm:inline">How it works</Link>
            <Link href="/#pricing" className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100">Pricing</Link>
            <Link href="/login" className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100">Sign in</Link>
            <Link href="/login?signup=1" className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700">Start free</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t border-slate-100 py-8 text-sm text-slate-500">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4">
          <span>© {new Date().getFullYear()} {process.env.BUSINESS_LEGAL_NAME || "Botly"}</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:underline">Terms</Link>
            <Link href="/privacy-policy" className="hover:underline">Privacy</Link>
            {process.env.SUPPORT_EMAIL ? <a href={`mailto:${process.env.SUPPORT_EMAIL}`} className="hover:underline">{process.env.SUPPORT_EMAIL}</a> : null}
          </div>
        </div>
      </footer>
    </div>
  );
}

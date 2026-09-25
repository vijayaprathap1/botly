"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3, BookOpen, Bot, CreditCard, Crown, Download, Gauge, Inbox, LayoutGrid, LogOut, Menu, MessagesSquare,
  Settings, Sparkles, UserRound, X,
} from "lucide-react";
import { Logo } from "./ui";

export type ShellBot = { id: string; name: string; business: string };
export type ShellProps = {
  email: string | null;
  isAdmin: boolean;
  hasWorkspace: boolean;
  bots: ShellBot[];
  trial: { left: number; limit: number; daysLeft: number; over: boolean } | null;
  planName: string | null;
  children: React.ReactNode;
};

function NavItem({ href, icon: Icon, label, active, onClick }: { href: string; icon: typeof Bot; label: string; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] font-medium transition ${
        active ? "bg-white text-zinc-950 shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-zinc-200/80" : "text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900"
      }`}
    >
      <Icon className={`h-4 w-4 flex-none ${active ? "text-brand-600" : "text-zinc-400 group-hover:text-zinc-600"}`} aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function AppShell(p: ShellProps) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const botMatch = /^\/app\/bots\/([0-9a-f-]{36})/.exec(path);
  const botId = botMatch?.[1] ?? (p.bots.length === 1 && !p.isAdmin ? p.bots[0]!.id : null);
  const current = p.bots.find((b) => b.id === botId);
  const base = botId ? `/app/bots/${botId}` : "";
  const is = (href: string, exact = false) => (exact ? path === href : path === href || path.startsWith(href + "/"));
  const close = () => setOpen(false);

  const botNav = botId
    ? [
        { href: base, icon: Gauge, label: "Overview", exact: true },
        { href: `${base}/playground`, icon: Sparkles, label: p.isAdmin ? "Playground" : "Preview" },
        { href: `${base}/knowledge`, icon: BookOpen, label: "Knowledge" },
        { href: `${base}/conversations`, icon: MessagesSquare, label: "Conversations" },
        { href: `${base}/leads`, icon: UserRound, label: "Leads" },
        { href: `${base}/unanswered`, icon: Inbox, label: "Unanswered" },
        { href: `${base}/reports`, icon: BarChart3, label: "Reports" },
        { href: `${base}/onboarding`, icon: Download, label: p.isAdmin ? "Onboarding" : "Import" },
        { href: `${base}/settings`, icon: Settings, label: "Settings" },
      ]
    : [];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/app" onClick={close}><Logo /></Link>
        <button className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200/60 lg:hidden" onClick={close} aria-label="Close menu"><X className="h-4 w-4" /></button>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4" aria-label="Main">
        <div className="space-y-0.5">
          {p.isAdmin ? <NavItem href="/app/admin" icon={Crown} label="Super admin" active={is("/app/admin")} onClick={close} /> : null}
          {p.isAdmin || p.bots.length > 1 ? <NavItem href="/app" icon={LayoutGrid} label={p.isAdmin ? "All assistants" : "Assistants"} active={path === "/app"} onClick={close} /> : null}
        </div>
        {botId ? (
          <div>
            <div className="mb-1.5 flex items-center gap-2 px-2">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded bg-brand-600 text-[10px] font-bold text-white">{(current?.business ?? "B").slice(0, 1).toUpperCase()}</span>
              <span className="truncate text-[12px] font-semibold text-zinc-900">{current?.business ?? "Assistant"}</span>
            </div>
            <div className="space-y-0.5">
              {botNav.map((n) => <NavItem key={n.href} href={n.href} icon={n.icon} label={n.label} active={is(n.href, n.exact)} onClick={close} />)}
            </div>
          </div>
        ) : null}
        {p.hasWorkspace ? (
          <div className="space-y-0.5">
            <div className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Account</div>
            <NavItem href="/app/billing" icon={CreditCard} label="Plan & billing" active={is("/app/billing")} onClick={close} />
          </div>
        ) : null}
      </nav>
      {p.trial ? (
        <div className="mx-3 mb-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-semibold text-zinc-900">{p.trial.over ? "Trial ended" : "Free trial"}</span>
            {!p.trial.over ? <span className="text-zinc-500">{p.trial.daysLeft}d left</span> : null}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div className={`h-full rounded-full ${p.trial.over ? "bg-red-500" : "bg-brand-600"}`} style={{ width: `${Math.min(100, ((p.trial.limit - p.trial.left) / Math.max(1, p.trial.limit)) * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-[11.5px] text-zinc-500">{p.trial.over ? "AI replies are paused." : `${p.trial.left} of ${p.trial.limit} replies left`}</p>
          <Link href="/app/billing" onClick={close} className="mt-2.5 flex h-7 items-center justify-center rounded-md bg-zinc-900 text-[12px] font-medium text-white hover:bg-zinc-800">
            {p.trial.over ? "Choose a plan" : "Upgrade"}
          </Link>
        </div>
      ) : p.planName ? (
        <div className="mx-5 mb-3 text-[12px] text-zinc-500">Plan: <span className="font-medium text-zinc-800">{p.planName}</span></div>
      ) : null}
      <div className="flex items-center gap-2 border-t border-zinc-200/80 px-4 py-3">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-zinc-200 text-[11px] font-semibold uppercase text-zinc-700">{(p.email ?? "?").slice(0, 1)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium text-zinc-800">{p.email}</div>
          <div className="text-[11px] text-zinc-500">{p.isAdmin ? "Super admin" : "Owner"}</div>
        </div>
        <form action="/auth/signout" method="post">
          <button className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700" aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-zinc-200/80 bg-zinc-50 lg:block print:hidden">{sidebar}</aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-zinc-950/30 backdrop-blur-[2px]" onClick={close} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-zinc-50 shadow-xl">{sidebar}</aside>
        </div>
      ) : null}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-zinc-200/80 bg-white/85 px-4 backdrop-blur lg:hidden print:hidden">
        <button className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        <Logo />
        {current ? <span className="ml-auto max-w-[45%] truncate text-[13px] text-zinc-500">{current.business}</span> : null}
      </header>
      <main className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{p.children}</main>
    </div>
  );
}


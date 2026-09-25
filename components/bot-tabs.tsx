"use client";
import { usePathname } from "next/navigation";
import { TabLink } from "./ui";

export function BotTabs({ botId, isAdmin }: { botId: string; isAdmin: boolean }) {
  const path = usePathname();
  const base = `/app/bots/${botId}`;
  const tabs = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/knowledge`, label: "Knowledge" },
    { href: `${base}/playground`, label: isAdmin ? "Playground" : "Preview" },
    { href: `${base}/settings`, label: "Settings" },
    { href: `${base}/onboarding`, label: isAdmin ? "Onboarding" : "Import" },
    { href: `${base}/conversations`, label: "Conversations" },
    { href: `${base}/leads`, label: "Leads" },
    { href: `${base}/unanswered`, label: "Unanswered" },
    { href: `${base}/reports`, label: "Reports" },
  ];
  return (
    <nav className="-mx-4 mb-5 flex overflow-x-auto print:hidden border-b border-slate-200 px-4" aria-label="Bot sections">
      {tabs.map((t) => (
        <TabLink key={t.href} href={t.href} active={t.exact ? path === t.href : path.startsWith(t.href)}>
          {t.label}
        </TabLink>
      ))}
    </nav>
  );
}

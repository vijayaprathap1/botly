import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { monthlyCap } from "./plans";
import { conversationAllowance, monthKey } from "./quota";
import { supabaseServer } from "./supabase/server";
import type { BotWithOrg } from "./types";
import { monthStartIso } from "./format";

/** Bot + org via the user's RLS client (404 if they can't see it). */
export const getBot = cache(async (botId: string): Promise<BotWithOrg> => {
  if (!/^[0-9a-f-]{36}$/i.test(botId)) notFound();
  const db = await supabaseServer();
  const { data } = await db.from("bots").select("*, org:organizations(*)").eq("id", botId).maybeSingle();
  if (!data) notFound();
  return data as BotWithOrg;
});

export type BotMetrics = {
  month: string;
  /** Conversations this assistant started this month. */
  conversations: number;
  messages: number;
  costUsd: number;
  leads: number;
  unanswered: number;
  /** The monthly limit this assistant runs against: the workspace's shared plan limit plus this month's top-ups (or a tighter per-assistant override). */
  quota: number;
  /** What counts toward `quota`: all the workspace's assistants together (or just this one under an override). */
  quotaUsed: number;
  /** How many assistants share the workspace's limit. */
  orgBots: number;
};

export async function botMetrics(bots: BotWithOrg[]): Promise<Map<string, BotMetrics>> {
  const db = await supabaseServer();
  const out = new Map<string, BotMetrics>();
  if (!bots.length) return out;
  // The plan's conversations are one limit per workspace, so count every assistant in each org,
  // not only the ones on this page (the bot page passes a single bot).
  const orgIds = [...new Set(bots.map((b) => b.org.id))];
  const { data: siblings } = await db.from("bots").select("id, org_id").in("org_id", orgIds);
  const orgOf = new Map<string, string>((siblings ?? []).map((s) => [s.id as string, s.org_id as string]));
  for (const b of bots) orgOf.set(b.id, b.org.id);
  const tzOf = new Map(bots.map((b) => [b.org.id, b.org.timezone]));
  const ids = [...orgOf.keys()];
  const months = [...new Set(bots.map((b) => monthKey(new Date(), b.org.timezone)))];
  const earliest = months.map((m) => monthStartIso(m, "Asia/Kolkata")).sort()[0]!;
  const since = new Date(new Date(earliest).getTime() - 24 * 3600_000).toISOString();
  // Owners can't read usage_monthly (it holds cost), so count their conversations directly.
  const ownerCounts = new Map<string, number>();
  const [usage, leads, unanswered] = await Promise.all([
    db.from("usage_monthly").select("bot_id, month, conversations, messages, cost_usd").in("bot_id", ids).in("month", months),
    db.from("leads").select("bot_id, created_at").in("bot_id", bots.map((b) => b.id)).gte("created_at", since),
    db.from("unanswered_questions").select("bot_id").in("bot_id", bots.map((b) => b.id)).eq("status", "open"),
  ]);
  if (!(usage.data ?? []).length) {
    await Promise.all(
      ids.map(async (id) => {
        const tz = tzOf.get(orgOf.get(id)!) ?? "Asia/Kolkata";
        const { count } = await db
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("bot_id", id)
          .eq("is_test", false)
          .gte("first_message_at", monthStartIso(monthKey(new Date(), tz), tz));
        ownerCounts.set(id, count ?? 0);
      }),
    );
  }
  const usedBy = (id: string, m: string) => (usage.data ?? []).find((r) => r.bot_id === id && r.month === m)?.conversations ?? ownerCounts.get(id) ?? 0;
  for (const b of bots) {
    const m = monthKey(new Date(), b.org.timezone);
    const start = monthStartIso(m, b.org.timezone);
    const u = (usage.data ?? []).find((r) => r.bot_id === b.id && r.month === m);
    const sameOrg = ids.filter((id) => orgOf.get(id) === b.org.id);
    const conversations = usedBy(b.id, m);
    const allowance = conversationAllowance({
      orgCap: monthlyCap(b.org.monthly_conversation_quota, b.org, m),
      botOverride: b.monthly_conversation_quota,
      orgUsed: sameOrg.reduce((sum, id) => sum + usedBy(id, m), 0),
      botUsed: conversations,
    });
    out.set(b.id, {
      month: m,
      conversations,
      messages: u?.messages ?? 0,
      costUsd: Number(u?.cost_usd ?? 0),
      leads: (leads.data ?? []).filter((l) => l.bot_id === b.id && l.created_at >= start).length,
      unanswered: (unanswered.data ?? []).filter((q) => q.bot_id === b.id).length,
      quota: allowance.limit,
      quotaUsed: allowance.used,
      orgBots: sameOrg.length,
    });
  }
  return out;
}

export function installSnippet(appUrl: string, key: string) {
  return `<script src="${appUrl}/widget.js" data-key="${key}" async></script>`;
}

/** Install code per platform, shown under the one-line snippet on the bot's Overview page. */
export function installGuides(appUrl: string, key: string): { id: string; title: string; where: string; label: string; code: string }[] {
  const src = `${appUrl}/widget.js`;
  return [
    {
      id: "html",
      title: "Plain HTML, Shopify, Wix, Squarespace",
      where: "Paste anywhere in the page: in <head> or just before </body>. Shopify: Online Store → Themes → Edit code → theme.liquid. Wix: Settings → Custom code → Body end.",
      label: "HTML",
      code: installSnippet(appUrl, key),
    },
    {
      id: "react",
      title: "React (Vite, Create React App)",
      where: "Easiest: paste the HTML line into index.html before </body>. Or load it once from your root component:",
      label: "App.tsx",
      code: `import { useEffect } from "react";

export function BotlyWidget() {
  useEffect(() => {
    if (document.querySelector('script[src="${src}"]')) return;
    const s = document.createElement("script");
    s.src = "${src}";
    s.async = true;
    s.dataset.key = "${key}";
    document.body.appendChild(s);
  }, []);
  return null;
}
// Render <BotlyWidget /> once, e.g. in App.`,
    },
    {
      id: "next",
      title: "Next.js (App Router or Pages Router)",
      where: "Add it once in app/layout.tsx (or pages/_app.tsx). It stays on screen across page changes.",
      label: "app/layout.tsx",
      code: `import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script src="${src}" data-key="${key}" strategy="afterInteractive" />
      </body>
    </html>
  );
}`,
    },
    {
      id: "wordpress",
      title: "WordPress",
      where: "Use a header/footer plugin (e.g. WPCode → Code Snippets → Header & Footer → Footer) and paste the HTML line. Or add it to your theme's footer.php just before </body>. Clear any cache plugin afterwards.",
      label: "HTML",
      code: installSnippet(appUrl, key),
    },
  ];
}

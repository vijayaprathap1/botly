import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { monthKey } from "./quota";
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
  conversations: number;
  messages: number;
  costUsd: number;
  leads: number;
  unanswered: number;
  quota: number;
};

export async function botMetrics(bots: BotWithOrg[]): Promise<Map<string, BotMetrics>> {
  const db = await supabaseServer();
  const out = new Map<string, BotMetrics>();
  if (!bots.length) return out;
  const ids = bots.map((b) => b.id);
  const months = [...new Set(bots.map((b) => monthKey(new Date(), b.org.timezone)))];
  const earliest = months.map((m) => monthStartIso(m, "Asia/Kolkata")).sort()[0]!;
  const since = new Date(new Date(earliest).getTime() - 24 * 3600_000).toISOString();
  // Owners can't read usage_monthly (it holds cost), so count their conversations directly.
  const ownerCounts = new Map<string, number>();
  const [usage, leads, unanswered] = await Promise.all([
    db.from("usage_monthly").select("bot_id, month, conversations, messages, cost_usd").in("bot_id", ids).in("month", months),
    db.from("leads").select("bot_id, created_at").in("bot_id", ids).gte("created_at", since),
    db.from("unanswered_questions").select("bot_id").in("bot_id", ids).eq("status", "open"),
  ]);
  if (!(usage.data ?? []).length) {
    await Promise.all(
      bots.map(async (b) => {
        const { count } = await db
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("bot_id", b.id)
          .eq("is_test", false)
          .gte("first_message_at", monthStartIso(monthKey(new Date(), b.org.timezone), b.org.timezone));
        ownerCounts.set(b.id, count ?? 0);
      }),
    );
  }
  for (const b of bots) {
    const m = monthKey(new Date(), b.org.timezone);
    const start = monthStartIso(m, b.org.timezone);
    const u = (usage.data ?? []).find((r) => r.bot_id === b.id && r.month === m);
    out.set(b.id, {
      month: m,
      conversations: u?.conversations ?? ownerCounts.get(b.id) ?? 0,
      messages: u?.messages ?? 0,
      costUsd: Number(u?.cost_usd ?? 0),
      leads: (leads.data ?? []).filter((l) => l.bot_id === b.id && l.created_at >= start).length,
      unanswered: (unanswered.data ?? []).filter((q) => q.bot_id === b.id).length,
      quota: b.monthly_conversation_quota ?? b.org.monthly_conversation_quota,
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

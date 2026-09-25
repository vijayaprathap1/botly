import { z } from "zod";
import { getSession } from "@/lib/auth";
import { buildReport, monthRange, reportCsv } from "@/lib/reports";
import { supabaseServer } from "@/lib/supabase/server";
import type { BotWithOrg } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const q = z.object({ bot: z.string().uuid(), month: z.string().regex(/^\d{4}-\d{2}$/) });

/** Monthly report CSV (P14). Admins and the bot's own client (RLS decides). */
export async function GET(req: Request) {
  if (!(await getSession())) return new Response("Sign in first", { status: 401 });
  const p = q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return new Response("Bad request", { status: 400 });
  const db = await supabaseServer();
  const { data: bot } = await db.from("bots").select("*, org:organizations(*)").eq("id", p.data.bot).maybeSingle();
  if (!bot) return new Response("Not found", { status: 404 });
  const report = await buildReport(db, bot as BotWithOrg, monthRange(p.data.month, (bot as BotWithOrg).org.timezone));
  return new Response(reportCsv(bot as BotWithOrg, report), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="botly-report-${p.data.month}.csv"`, "Cache-Control": "no-store" },
  });
}

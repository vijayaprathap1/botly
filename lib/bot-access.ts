import "server-only";
import { redirect } from "next/navigation";
import { requireSession, type Session } from "./auth";
import { supabaseAdmin } from "./supabase/admin";
import type { BotWithOrg } from "./types";

/**
 * Who may change a bot: the platform super admin, or an owner of the bot's business
 * (self-serve customers and invited clients). Writes then use the service role with
 * whitelisted fields, so customers can never touch plan, quota, model or billing.
 */
export async function loadEditableBot(session: Session, botId: string): Promise<BotWithOrg | null> {
  if (!/^[0-9a-f-]{36}$/i.test(botId)) return null;
  const { data } = await supabaseAdmin().from("bots").select("*, org:organizations(*)").eq("id", botId).maybeSingle();
  if (!data) return null;
  const bot = data as BotWithOrg;
  if (session.isAdmin || session.orgIds.includes(bot.org_id)) return bot;
  return null;
}

export async function requireBotEditor(botId: string): Promise<{ session: Session; bot: BotWithOrg }> {
  const session = await requireSession();
  const bot = await loadEditableBot(session, botId);
  if (!bot) redirect("/app");
  return { session, bot };
}

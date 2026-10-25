import type { SupabaseClient } from "@supabase/supabase-js";
import { customerHost } from "./hosts";
import { quietDeadline, track } from "./track";

let disabled = false;

type SeenBot = {
  id: string;
  org_id?: string;
  org?: { id: string };
  first_seen_origin?: string | null;
};

const MISSING = /first_seen_origin|schema cache|does not exist|could not find the/i;

/**
 * First time the embed loads on a real customer domain, remember that domain.
 * Later loads are a no-op. Test links, botly.in, Vercel previews and localhost
 * are ignored. Never throws and never fails the config response.
 */
export async function recordWidgetFirstLoad(db: SupabaseClient, bot: SeenBot, origin: string | null): Promise<void> {
  if (disabled || bot.first_seen_origin) return;
  const host = customerHost(origin);
  if (!host) return;
  try {
    const now = new Date().toISOString();
    const result = await quietDeadline(
      db.from("bots").update({ first_seen_origin: host, first_seen_at: now }).eq("id", bot.id).is("first_seen_origin", null).select("id"),
    );
    if (!result) {
      console.error("[analytics] widget_first_load timed out");
      return;
    }
    const { data, error } = result;
    if (error) {
      if (MISSING.test(error.message)) disabled = true;
      console.error("[analytics] widget_first_load", error.message);
      return;
    }
    if (!data?.length) return;
    await track({
      name: "widget_first_load",
      orgId: bot.org?.id ?? bot.org_id ?? null,
      botId: bot.id,
      properties: { origin: host },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (MISSING.test(message)) disabled = true;
    console.error("[analytics] widget_first_load", message);
  }
}

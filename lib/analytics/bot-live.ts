import { customerHost } from "./hosts";
import { track } from "./track";
import { supabaseAdmin } from "../supabase/admin";

let disabled = false;

const MISSING = /analytics_events|schema cache|does not exist|could not find the table/i;

export type BotLiveInput = {
  botId: string | null;
  orgId: string | null;
  conversationId: string | null;
  isNewConversation: boolean;
  isTest: boolean;
  origin: string | null;
  pageUrl: string | null;
  language: string | null;
};

/**
 * First real visitor conversation on a customer site (not a test link, not botly.in).
 * Runs after the reply is sent. One event per bot; a duplicate insert is ignored.
 */
export async function trackBotLive(input: BotLiveInput): Promise<void> {
  if (disabled) return;
  if (!input.botId || !input.orgId || !input.isNewConversation || input.isTest) return;
  const host = customerHost(input.origin) ?? customerHost(input.pageUrl);
  if (!host) return;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.from("analytics_events").select("id").eq("bot_id", input.botId).eq("event_name", "bot_live").limit(1).maybeSingle();
    if (error) {
      if (MISSING.test(error.message)) disabled = true;
      console.error("[analytics] bot_live", error.message);
      return;
    }
    if (data) return;
    const page = (input.pageUrl ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 500);
    await track({
      name: "bot_live",
      orgId: input.orgId,
      botId: input.botId,
      properties: {
        origin: host,
        ...(page ? { page_url: page } : {}),
        ...(input.language ? { language: input.language.slice(0, 20) } : {}),
      },
    });
  } catch (e) {
    console.error("[analytics] bot_live", e instanceof Error ? e.message : e);
  }
}

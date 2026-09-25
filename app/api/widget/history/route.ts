import { resolveAccess } from "@/lib/chat/access";
import { SupabaseStore } from "@/lib/chat/supabase-store";
import { json, preflight } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { historyQuerySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Last 24 hours of one visitor's conversation, for restoring the widget on reload. */
export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[api/widget/history]", e instanceof Error ? e.message : e);
    return json(req, { messages: [] });
  }
}

async function handle(req: Request) {
  const u = new URL(req.url).searchParams;
  const parsed = historyQuerySchema.safeParse({
    key: u.get("key"),
    visitorId: u.get("visitorId"),
    conversationId: u.get("conversationId"),
    testToken: u.get("t"),
  });
  if (!parsed.success) return json(req, { messages: [] });
  const store = new SupabaseStore(supabaseAdmin());
  const bot = await store.getBotByKey(parsed.data.key);
  if (!bot || !resolveAccess(bot, req.headers.get("origin"), parsed.data.testToken).allowed) return json(req, { messages: [] });

  const conv = await store.getConversation(parsed.data.conversationId);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (!conv || conv.bot_id !== bot.id || conv.visitor_id !== parsed.data.visitorId || (conv.last_message_at ?? "") < since) {
    return json(req, { messages: [] });
  }
  const rows = await store.getMessages(conv.id, 60, since);
  return json(req, {
    status: conv.status,
    hasLead: Boolean(conv.lead_id),
    messages: rows
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role, content: m.content, at: m.created_at })),
  });
}

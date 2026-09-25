import { z } from "zod";
import { getSession } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const q = z.object({ bot: z.string().uuid(), type: z.enum(["leads", "conversations"]), format: z.enum(["csv", "json"]).default("csv") });

/** Admin export (P17): leads or full conversations with messages, as CSV or JSON. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.isAdmin) return new Response("Admins only", { status: 403 });
  const p = q.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return new Response("Bad request", { status: 400 });
  const { bot, type, format } = p.data;
  const db = await supabaseServer();
  const stamp = new Date().toISOString().slice(0, 10);

  if (type === "leads") {
    const { data } = await db.from("leads").select("created_at, name, phone, email, need, type, status, conversation_id, notified_email_at, notified_whatsapp_at").eq("bot_id", bot).order("created_at", { ascending: false });
    const rows = data ?? [];
    if (format === "json") return download(JSON.stringify(rows, null, 2), `leads-${stamp}.json`, "application/json");
    return download(toCsv([["created_at", "name", "phone", "email", "need", "type", "status", "conversation_id", "notified_email_at", "notified_whatsapp_at"], ...rows.map((r) => [r.created_at, r.name, r.phone, r.email, r.need, r.type, r.status, r.conversation_id, r.notified_email_at, r.notified_whatsapp_at])]), `leads-${stamp}.csv`, "text/csv");
  }

  const { data: convs } = await db.from("conversations").select("id, created_at, visitor_id, page_url, language, status, message_count, is_test").eq("bot_id", bot).order("created_at", { ascending: false }).limit(5000);
  const ids = (convs ?? []).map((c) => c.id);
  const messages: { conversation_id: string; created_at: string; role: string; content: string }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("messages").select("conversation_id, created_at, role, content").in("conversation_id", ids.slice(i, i + 200)).order("created_at");
    messages.push(...(data ?? []));
  }
  if (format === "json") {
    const by = new Map<string, typeof messages>();
    for (const m of messages) by.set(m.conversation_id, [...(by.get(m.conversation_id) ?? []), m]);
    return download(JSON.stringify((convs ?? []).map((c) => ({ ...c, messages: by.get(c.id) ?? [] })), null, 2), `conversations-${stamp}.json`, "application/json");
  }
  return download(toCsv([["conversation_id", "message_at", "role", "content"], ...messages.map((m) => [m.conversation_id, m.created_at, m.role, m.content])]), `conversations-${stamp}.csv`, "text/csv");
}

function download(body: string, filename: string, type: string) {
  return new Response(body, { headers: { "Content-Type": `${type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}

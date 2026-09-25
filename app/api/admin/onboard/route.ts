import { z } from "zod";
import { getSession } from "@/lib/auth";
import { loadEditableBot } from "@/lib/bot-access";
import { config } from "@/lib/config";
import { runOnboarding } from "@/lib/onboarding/pipeline";
import { planDef } from "@/lib/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  botId: z.string().uuid(),
  url: z.string().trim().url().max(500).optional().nullable(),
  maxPages: z.coerce.number().int().min(1).max(100).optional(),
  draft: z.boolean().default(true),
  ownerNotes: z.string().max(20000).optional(),
});

/**
 * Onboarding (P18). Admins: crawl + drafts for review. Customers (self-serve):
 * crawl within their plan's page limit, auto-approve, business profile, safety check, go live.
 * Streams NDJSON progress.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const bot = await loadEditableBot(session, parsed.data.botId);
  if (!bot) return Response.json({ error: "Not found" }, { status: 404 });
  const selfServe = !session.isAdmin || Boolean(bot.org.self_serve);
  const cap = selfServe ? planDef(bot.org.plan).crawlPages : 100;
  const maxPages = Math.min(parsed.data.maxPages ?? config.crawlMaxPages, cap);
  const db = supabaseAdmin();
  if (selfServe) await db.from("organizations").update({ onboarding_status: "running" }).eq("id", bot.org_id);

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: Record<string, unknown>) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        await runOnboarding(
          { db, botId: bot.id, userId: session.userId, url: parsed.data.url ?? bot.website_url, maxPages, draft: parsed.data.draft, selfServe, ownerNotes: parsed.data.ownerNotes },
          send,
        );
        if (selfServe) await db.from("organizations").update({ onboarding_status: "done" }).eq("id", bot.org_id);
      } catch (e) {
        if (selfServe) await db.from("organizations").update({ onboarding_status: "failed" }).eq("id", bot.org_id);
        send({ stage: "error", message: e instanceof Error ? e.message : "Onboarding failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
}

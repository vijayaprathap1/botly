import { after } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { loadEditableBot } from "@/lib/bot-access";
import { config } from "@/lib/config";
import { runOnboarding, type OnboardEvent } from "@/lib/onboarding/pipeline";
import { planDef } from "@/lib/plans";
import { PostgresRateLimiter } from "@/lib/security/rate-limit";
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

/** Longer than maxDuration, so a lock left by a killed function frees itself. */
const LOCK_SECONDS = 600;

/**
 * Onboarding (P18). Admins: crawl + drafts for review. Customers (self-serve):
 * crawl within their plan's page limit, auto-approve, business profile, safety check, go live.
 * Streams NDJSON progress. The import itself does not depend on the stream: if the
 * browser tab is closed it still runs to the end, and the dashboard shows the result.
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

  // One import per assistant at a time: two running together would save every page and FAQ twice.
  const lockKey = `onboard:${bot.id}`;
  const lock = await new PostgresRateLimiter(db).hit(lockKey, 1, LOCK_SECONDS);
  if (!lock.allowed) return Response.json({ error: "An import is already running for this assistant. It finishes in a few minutes; then you can run it again." }, { status: 409 });
  const unlock = async () => {
    const { error } = await db.from("rate_limits").delete().eq("key", lockKey);
    if (error) console.error("[onboard] unlock", error.message);
  };

  if (selfServe) await db.from("organizations").update({ onboarding_status: "running" }).eq("id", bot.org_id);

  // Progress goes to whoever is still listening; a closed tab must not stop or fail the import.
  let listener: ((e: OnboardEvent) => void) | null = null;
  const backlog: OnboardEvent[] = [];
  const send = (e: OnboardEvent) => {
    if (!listener) return void backlog.push(e);
    try {
      listener(e);
    } catch {
      listener = () => {};
    }
  };

  const work = (async () => {
    try {
      await runOnboarding(
        { db, botId: bot.id, userId: session.userId, url: parsed.data.url ?? bot.website_url, maxPages, draft: parsed.data.draft, selfServe, ownerNotes: parsed.data.ownerNotes },
        send,
      );
      if (selfServe) await db.from("organizations").update({ onboarding_status: "done" }).eq("id", bot.org_id);
    } catch (e) {
      console.error("[onboard]", bot.id, e instanceof Error ? e.message : e);
      if (selfServe) await db.from("organizations").update({ onboarding_status: "failed" }).eq("id", bot.org_id);
      send({ stage: "error", message: e instanceof Error ? e.message : "Onboarding failed" });
    } finally {
      await unlock();
    }
  })();
  // Keeps the function alive until the import ends, even after the response stream is gone.
  after(() => work);

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      listener = (e) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      for (const e of backlog.splice(0)) send(e);
      void work.finally(() => {
        try {
          controller.close();
        } catch {
          /* the reader already left */
        }
      });
    },
    cancel() {
      listener = () => {};
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
}

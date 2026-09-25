import { z } from "zod";
import { getSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { crawlSite } from "@/lib/crawler/crawl";
import { draftKnowledge, policyToText } from "@/lib/onboarding/draft";
import { supabaseServer } from "@/lib/supabase/server";
import { estimateTokens } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  botId: z.string().uuid(),
  url: z.string().trim().url().max(500),
  maxPages: z.coerce.number().int().min(1).max(100).optional(),
  draft: z.boolean().default(true),
});

/**
 * Onboarding wizard (P18): crawl → save pages/products as drafts → Claude drafts FAQ,
 * policy summary and tone → all saved as DRAFT for approval. Streams NDJSON progress.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.isAdmin) return Response.json({ error: "Admins only" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { botId, url, draft } = parsed.data;
  const maxPages = parsed.data.maxPages ?? config.crawlMaxPages;

  const db = await supabaseServer(); // RLS: admin policies apply
  const { data: bot } = await db.from("bots").select("id, model, org:organizations(name)").eq("id", botId).maybeSingle();
  if (!bot) return Response.json({ error: "Bot not found" }, { status: 404 });
  const businessName = (bot.org as unknown as { name: string } | null)?.name ?? "the business";

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: Record<string, unknown>) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        await db.from("bots").update({ website_url: url }).eq("id", botId);
        const result = await crawlSite(url, { maxPages }, (e) => send(e));

        // Skip URLs we already have for this bot, so re-running doesn't duplicate.
        const { data: existing } = await db.from("knowledge_sources").select("url").eq("bot_id", botId).not("url", "is", null);
        const have = new Set((existing ?? []).map((r) => r.url as string));
        const rows = [
          ...result.pages
            .filter((p) => !have.has(p.url))
            .map((p) => ({ type: "page", title: p.title || new URL(p.url).pathname, url: p.url, content: p.text })),
          ...result.products
            .filter((p) => !have.has(p.url))
            .map((p) => ({ type: "product", title: p.title, url: p.url, content: p.content })),
          ...(result.siteWide ? [{ type: "page", title: "Site-wide details (header and footer)", url: null, content: result.siteWide }] : []),
        ].map((r) => ({ ...r, bot_id: botId, status: "draft", token_count: estimateTokens(r.content), updated_by: session.userId }));
        for (let i = 0; i < rows.length; i += 100) {
          const { error } = await db.from("knowledge_sources").insert(rows.slice(i, i + 100));
          if (error) throw new Error(error.message);
        }
        send({ stage: "saved", message: `Saved ${rows.length} pages and products as drafts`, count: rows.length });

        if (draft && result.pages.length) {
          send({ stage: "drafting", message: "Claude is drafting FAQs, a policy summary and the tone of voice…" });
          const d = await draftKnowledge({
            businessName,
            pages: result.pages.map((p) => ({ title: p.title, url: p.url, text: p.text })).concat(result.siteWide ? [{ title: "Site-wide", url: url, text: result.siteWide }] : []),
            products: result.products,
            model: process.env.ONBOARDING_MODEL || bot.model || config.defaultModel,
          });
          const drafts = [
            ...d.faqs.map((f) => ({ type: "faq", title: f.question.slice(0, 200), url: f.source_url ?? null, content: `Q: ${f.question}\nA: ${f.answer}` })),
            ...(policyToText(d.policy) ? [{ type: "policy", title: "Policy summary (drafted from website)", url: null, content: policyToText(d.policy) }] : []),
          ].map((r) => ({ ...r, bot_id: botId, status: "draft", token_count: estimateTokens(r.content), updated_by: session.userId }));
          if (drafts.length) {
            const { error } = await db.from("knowledge_sources").insert(drafts);
            if (error) throw new Error(error.message);
          }
          if (d.tone) await db.from("bots").update({ tone_suggestion: d.tone }).eq("id", botId);
          send({ stage: "drafted", message: `Drafted ${d.faqs.length} FAQs${policyToText(d.policy) ? ", a policy summary" : ""} and a tone line`, count: d.faqs.length });
        }
        send({ stage: "done", message: "Done. Review and approve the drafts in Knowledge." });
      } catch (e) {
        send({ stage: "error", message: e instanceof Error ? e.message : "Onboarding failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import { crawlSite } from "../crawler/crawl";
import { runSafetyCheck } from "../eval/run";
import type { KnowledgeSource } from "../knowledge";
import { getLlm } from "../llm";
import { estimateTokens } from "../tokens";
import type { BotWithOrg } from "../types";
import { draftKnowledge, policyToText } from "./draft";

export type OnboardEvent = { stage: string; message: string; count?: number; total?: number };

export type OnboardOptions = {
  db: SupabaseClient; // service role (caller has already checked access)
  botId: string;
  userId: string;
  url?: string | null;
  maxPages: number;
  draft: boolean;
  /** Self-serve: approve drafts, fill greeting/suggestions/tone, save the business profile, run the safety check and go live. */
  selfServe: boolean;
  /** Details the owner typed in the sign-up form. */
  ownerNotes?: string;
};

/**
 * Onboarding pipeline shared by the admin wizard and self-serve sign-up:
 * crawl → save pages/products → Claude drafts FAQs, policies, tone and a business profile.
 */
export async function runOnboarding(o: OnboardOptions, send: (e: OnboardEvent) => void): Promise<{ ok: boolean }> {
  const { db, botId } = o;
  const { data: botRow } = await db.from("bots").select("*, org:organizations(*)").eq("id", botId).single();
  if (!botRow) throw new Error("Bot not found");
  const bot = botRow as BotWithOrg;
  const status = o.selfServe ? "approved" : "draft";
  const stamp = (r: { type: string; title: string; url: string | null; content: string }, st = status) => ({
    ...r,
    bot_id: botId,
    status: st,
    token_count: estimateTokens(r.content),
    updated_by: o.userId,
  });

  let pages: { title: string; url: string; text: string }[] = [];
  let products: { title: string; url: string; content: string }[] = [];
  let siteWide = "";
  if (o.url) {
    await db.from("bots").update({ website_url: o.url }).eq("id", botId);
    try {
      const result = await crawlSite(o.url, { maxPages: o.maxPages }, (e) => send(e));
      pages = result.pages.map((p) => ({ title: p.title, url: p.url, text: p.text }));
      products = result.products;
      siteWide = result.siteWide;
    } catch (e) {
      send({ stage: "skip", message: `Couldn't read the website: ${e instanceof Error ? e.message : "unknown error"}. Continuing with the details you entered.` });
    }
    const { data: existing } = await db.from("knowledge_sources").select("url").eq("bot_id", botId).not("url", "is", null);
    const have = new Set((existing ?? []).map((r) => r.url as string));
    // Raw pages stay drafts even for self-serve: the drafted FAQ/profile carry the facts, pages are backup.
    const rows = [
      ...pages.filter((p) => !have.has(p.url)).map((p) => stamp({ type: "page", title: p.title || new URL(p.url).pathname, url: p.url, content: p.text }, "draft")),
      ...products.filter((p) => !have.has(p.url)).map((p) => stamp({ type: "product", title: p.title, url: p.url, content: p.content })),
      ...(siteWide ? [stamp({ type: "page", title: "Site-wide details (header and footer)", url: null, content: siteWide }, "draft")] : []),
    ];
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await db.from("knowledge_sources").insert(rows.slice(i, i + 100));
      if (error) throw new Error(error.message);
    }
    send({ stage: "saved", message: `Saved ${rows.length} pages and products`, count: rows.length });
  }

  const haveInput = pages.length > 0 || Boolean(o.ownerNotes?.trim());
  if (o.draft && haveInput) {
    send({ stage: "drafting", message: "Writing your business profile, FAQs and policies…" });
    try {
      const d = await draftKnowledge({
        businessName: bot.org.name,
        pages: pages.concat(siteWide ? [{ title: "Site-wide", url: o.url ?? "", text: siteWide }] : []),
        products,
        ownerNotes: o.ownerNotes,
        model: process.env.ONBOARDING_MODEL || bot.model || config.defaultModel,
      });
      const drafts = [
        ...d.faqs.map((f) => stamp({ type: "faq", title: f.question.slice(0, 200), url: f.source_url ?? null, content: `Q: ${f.question}\nA: ${f.answer}` })),
        ...(policyToText(d.policy) ? [stamp({ type: "policy", title: "Policy summary", url: null, content: policyToText(d.policy) })] : []),
        ...(o.selfServe && d.profile_markdown ? [stamp({ type: "note", title: "Business profile", url: null, content: d.profile_markdown })] : []),
      ];
      if (drafts.length) {
        const { error } = await db.from("knowledge_sources").insert(drafts);
        if (error) throw new Error(error.message);
      }
      if (o.selfServe) {
        const botPatch: Record<string, unknown> = {};
        if (d.tone) botPatch.tone = d.tone;
        if (d.greeting) botPatch.greeting = d.greeting;
        if (d.suggested_questions?.length) botPatch.suggested_questions = d.suggested_questions;
        if (Object.keys(botPatch).length) await db.from("bots").update(botPatch).eq("id", botId);
        await db
          .from("organizations")
          .update({
            profile_markdown: d.profile_markdown ?? null,
            profile_sources: [...(o.url ? [{ type: "website", url: o.url, pages: pages.length }] : []), ...(o.ownerNotes ? [{ type: "owner_provided" }] : [])],
            profile_updated_at: new Date().toISOString(),
            ...(d.business_type ? { business_type: d.business_type } : {}),
          })
          .eq("id", bot.org_id);
      } else if (d.tone) await db.from("bots").update({ tone_suggestion: d.tone }).eq("id", botId);
      send({ stage: "drafted", message: `Wrote ${d.faqs.length} FAQs${policyToText(d.policy) ? ", a policy summary" : ""}${o.selfServe && d.profile_markdown ? " and your business profile" : ""}`, count: d.faqs.length });
    } catch (e) {
      console.error("[onboarding] drafting failed", e instanceof Error ? e.message : e);
      send({ stage: "skip", message: "Couldn't write the FAQs automatically. Using your website pages directly instead." });
      if (o.selfServe) await db.from("knowledge_sources").update({ status: "approved" }).eq("bot_id", botId).eq("type", "page");
    }
  } else if (o.selfServe && pages.length) {
    await db.from("knowledge_sources").update({ status: "approved" }).eq("bot_id", botId).eq("type", "page");
  }

  if (o.selfServe) {
    send({ stage: "checking", message: "Running safety checks (the assistant must refuse fake discounts and prompt tricks)…" });
    const passed = await goLiveCheck(db, botId);
    send({ stage: passed ? "live" : "skip", message: passed ? "Safety checks passed. Your assistant is live." : "Safety checks didn't all pass. Your assistant works in preview; we'll review it." });
  }
  send({ stage: "done", message: o.selfServe ? "Your assistant is ready." : "Done. Review and approve the drafts in Knowledge." });
  return { ok: true };
}

/** Runs the prompt-injection cases with the real model, records them, and sets the bot live if all pass. */
export async function goLiveCheck(db: SupabaseClient, botId: string): Promise<boolean> {
  const { data: botRow } = await db.from("bots").select("*, org:organizations(*)").eq("id", botId).single();
  const { data: ks } = await db.from("knowledge_sources").select("id, type, title, url, content").eq("bot_id", botId).eq("status", "approved");
  if (!botRow) return false;
  const r = await runSafetyCheck(botRow as BotWithOrg, (ks ?? []) as KnowledgeSource[], getLlm());
  await db.from("eval_runs").insert({
    bot_id: botId,
    passed: r.passed,
    total: r.total,
    injection_passed: r.injectionPassed,
    first_token_p50_ms: r.firstTokenP50,
    results: r.results.map((x) => ({ id: x.id, category: x.category, pass: x.pass, failures: x.failures, reply: x.reply.slice(0, 500) })),
  });
  if (r.injectionPassed) await db.from("bots").update({ status: "live" }).eq("id", botId);
  return r.injectionPassed;
}

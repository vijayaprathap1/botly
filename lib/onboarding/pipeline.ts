import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import { crawlSite } from "../crawler/crawl";
import { runSafetyCheck, SAFETY_CASES } from "../eval/run";
import type { KnowledgeSource } from "../knowledge";
import { getLlm } from "../llm";
import { requestTokenLimit } from "../llm/provider";
import { estimateTokens } from "../tokens";
import type { BotWithOrg } from "../types";
import { draftKnowledge, isRealAnswer, policyToText } from "./draft";

export type OnboardEvent = {
  stage: string;
  message: string;
  count?: number;
  total?: number;
  /** On the final "done" event (self-serve): live, preview (safety check failed) or busy (check couldn't finish). */
  outcome?: "live" | "preview" | "busy";
};

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
  /** Time allowed for the whole import (default 270 s). */
  budgetMs?: number;
  /** Demo bots stay drafts behind a test token, so the go-live check is skipped. */
  skipSafetyCheck?: boolean;
};

/**
 * Onboarding pipeline shared by the admin wizard and self-serve sign-up:
 * crawl → save pages/products → Claude drafts FAQs, policies, tone and a business profile.
 */
export async function runOnboarding(o: OnboardOptions, send: (e: OnboardEvent) => void): Promise<{ ok: boolean }> {
  const { db, botId } = o;
  // The whole import must fit one serverless invocation (300 s): leave the safety check out
  // rather than be cut off half-way with nothing recorded.
  const mustEndBy = Date.now() + (o.budgetMs ?? 270_000);
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
    // The site-wide row has no URL to recognise it by: keep one and refresh it on a re-import.
    const SITE_WIDE = "Site-wide details (header and footer)";
    const { data: priorSiteWide } = await db.from("knowledge_sources").select("id").eq("bot_id", botId).eq("type", "page").eq("title", SITE_WIDE).is("url", null).limit(1);
    const siteWideId = priorSiteWide?.[0]?.id as string | undefined;
    if (siteWide && siteWideId) {
      const { error } = await db.from("knowledge_sources").update({ content: siteWide, token_count: estimateTokens(siteWide), updated_by: o.userId }).eq("id", siteWideId);
      if (error) throw new Error(error.message);
    }
    // Raw pages stay drafts even for self-serve: the drafted FAQ/profile carry the facts, pages are backup.
    const rows = [
      ...pages.filter((p) => !have.has(p.url)).map((p) => stamp({ type: "page", title: p.title || new URL(p.url).pathname, url: p.url, content: p.text }, "draft")),
      ...products.filter((p) => !have.has(p.url)).map((p) => stamp({ type: "product", title: p.title, url: p.url, content: p.content })),
      ...(siteWide && !siteWideId ? [stamp({ type: "page", title: SITE_WIDE, url: null, content: siteWide }, "draft")] : []),
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
        onProgress: (message) => send({ stage: "drafting", message }),
      });
      // "Not found on the website" is the drafter's placeholder for a missing fact, not an answer:
      // never save it as knowledge, and don't offer its question as a starter chip.
      const unanswered = new Set(d.faqs.filter((f) => !isRealAnswer(f.answer)).map((f) => f.question.trim().toLowerCase()));
      d.faqs = d.faqs.filter((f) => isRealAnswer(f.answer));
      if (d.suggested_questions) d.suggested_questions = d.suggested_questions.filter((q) => !unanswered.has(q.trim().toLowerCase()));
      const drafts = [
        ...d.faqs.map((f) => stamp({ type: "faq", title: f.question.slice(0, 200), url: f.source_url ?? null, content: `Q: ${f.question}\nA: ${f.answer}` })),
        ...(policyToText(d.policy) ? [stamp({ type: "policy", title: "Policy summary", url: null, content: policyToText(d.policy) })] : []),
        ...(o.selfServe && d.profile_markdown ? [stamp({ type: "note", title: "Business profile", url: null, content: d.profile_markdown })] : []),
      ];
      // Importing again must not pile up copies: skip FAQs we already have (any status, so an
      // archived answer stays archived) and refresh the single policy summary / profile.
      const { data: prior } = await db.from("knowledge_sources").select("id, type, title").eq("bot_id", botId).in("type", ["faq", "policy", "note"]);
      const key = (type: string, title: string) => `${type}:${title.trim().toLowerCase()}`;
      const priorId = new Map((prior ?? []).map((r) => [key(r.type as string, r.title as string), r.id as string]));
      const fresh = drafts.filter((r) => !priorId.has(key(r.type, r.title)));
      if (fresh.length) {
        const { error } = await db.from("knowledge_sources").insert(fresh);
        if (error) throw new Error(error.message);
      }
      for (const r of drafts.filter((x) => x.type !== "faq" && priorId.has(key(x.type, x.title)))) {
        const { error } = await db.from("knowledge_sources").update({ content: r.content, token_count: r.token_count, updated_by: r.updated_by }).eq("id", priorId.get(key(r.type, r.title))!);
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

  let outcome: OnboardEvent["outcome"];
  if (o.selfServe && !o.skipSafetyCheck) {
    const slow = safetyPaceMs() > 0;
    send({ stage: "checking", message: `Running safety checks (the assistant must refuse fake discounts and prompt tricks)…${slow ? " This takes about two minutes." : ""}` });
    const left = mustEndBy - Date.now();
    // Paced checks need (cases − 1) pauses plus the calls themselves.
    const needed = slow ? safetyPaceMs() * (SAFETY_CASES.length - 1) + 30_000 : 30_000;
    const check = left < needed ? { passed: false, inconclusive: true } : await goLiveCheck(db, botId, { budgetMs: left - 10_000 });
    outcome = check.passed ? "live" : check.inconclusive ? "busy" : "preview";
    send({
      stage: check.passed ? "live" : "warn",
      message: check.passed
        ? "Safety checks passed. Your assistant is live."
        : check.inconclusive
          ? "There wasn't time to finish the safety checks (the AI service is busy). Your assistant works in preview; press “Run checks and go live” on the next screen in a minute."
          : "Safety checks didn't all pass, so your assistant stays in preview for now. Add more details in Knowledge, then press “Run checks and go live”.",
    });
  }
  // Knowledge changed: bring the retrieval index up to date (no-op below the size cap).
  await afterOnboarding(botId);
  send({ stage: "done", message: o.selfServe ? (outcome === "live" ? "Your assistant is ready." : "Your assistant is ready to preview.") : "Done. Review and approve the drafts in Knowledge.", outcome });
  return { ok: true };
}

/**
 * Providers with a small per-minute token limit (free tiers) can't take the four checks
 * at once: the model would be rate-limited mid-check. Run them one at a time, spaced out.
 */
export function safetyPaceMs(): number {
  return requestTokenLimit() ? 32_000 : 0;
}

async function afterOnboarding(botId: string): Promise<void> {
  try {
    const { syncChunks } = await import("../retrieval/index-sync");
    await syncChunks(botId);
  } catch (e) {
    console.error("[onboarding] index sync", e instanceof Error ? e.message : e);
  }
}

export type GoLiveResult = { passed: boolean; inconclusive: boolean };

/** Runs the prompt-injection cases with the real model, records them, and sets the bot live if all pass. */
export async function goLiveCheck(db: SupabaseClient, botId: string, opts: { budgetMs?: number } = {}): Promise<GoLiveResult> {
  const { data: botRow } = await db.from("bots").select("*, org:organizations(*)").eq("id", botId).single();
  const { data: ks } = await db.from("knowledge_sources").select("id, type, title, url, content").eq("bot_id", botId).eq("status", "approved");
  if (!botRow) return { passed: false, inconclusive: false };
  const r = await runSafetyCheck(botRow as BotWithOrg, (ks ?? []) as KnowledgeSource[], getLlm(), { paceMs: safetyPaceMs(), budgetMs: opts.budgetMs });
  // A check the AI service never answered says nothing about the assistant: don't record it as a failure.
  if (r.inconclusive) return { passed: false, inconclusive: true };
  await db.from("eval_runs").insert({
    bot_id: botId,
    passed: r.passed,
    total: r.total,
    injection_passed: r.injectionPassed,
    first_token_p50_ms: r.firstTokenP50,
    results: r.results.map((x) => ({ id: x.id, category: x.category, pass: x.pass, failures: x.failures, reply: x.reply.slice(0, 500) })),
  });
  if (r.injectionPassed) await db.from("bots").update({ status: "live" }).eq("id", botId);
  return { passed: r.injectionPassed, inconclusive: false };
}

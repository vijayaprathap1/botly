import Anthropic from "@anthropic-ai/sdk";
import { openAiForcedToolCall } from "../llm/openai-compat";
import { llmKeyName, llmKeyPresent, llmProvider, requestTokenLimit, resolveModel } from "../llm/provider";
import type { ToolDef } from "../llm/types";
import { DRAFT_TOOL, ONBOARDING_SYSTEM } from "../prompts/onboarding";
import { estimateTokens } from "../tokens";

export type Drafts = {
  faqs: { question: string; answer: string; source_url?: string }[];
  policy: Record<"shipping" | "cod" | "returns" | "exchange" | "payment" | "hours" | "contact", string>;
  tone: string;
  profile_markdown?: string;
  business_type?: string;
  greeting?: string;
  suggested_questions?: string[];
  usage: { input: number; output: number };
};

type DraftInput = Omit<Drafts, "usage">;
const NOT_FOUND = /^not found on the website/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Splits the material into batches that fit one request. `limit` = the provider's
 * request limit (input + output tokens) or null for one batch up to `budget`.
 */
export function planBatches(parts: string[], budget: number, limit: number | null, overhead: number, maxOut: number): string[][] {
  const perBatch = limit ? Math.max(1_000, limit - overhead - maxOut) : budget;
  const batches: string[][] = [];
  let cur: string[] = [];
  let used = 0;
  let total = 0;
  for (const part of parts) {
    let t = estimateTokens(part);
    let piece = part;
    if (t > perBatch) {
      // One huge page: keep its first perBatch tokens (~4 characters a token).
      piece = part.slice(0, perBatch * 4);
      t = estimateTokens(piece);
    }
    if (total + t > budget) break;
    if (used + t > perBatch && cur.length) {
      batches.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(piece);
    used += t;
    total += t;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

/** Combines drafts from several batches: FAQs de-duplicated, first real policy line per topic wins. */
export function mergeDrafts(list: DraftInput[]): DraftInput {
  const faqs: Drafts["faqs"] = [];
  const seen = new Set<string>();
  const policy = {} as Drafts["policy"];
  const out: DraftInput = { faqs, policy, tone: "" };
  for (const d of list) {
    for (const f of Array.isArray(d.faqs) ? d.faqs : []) {
      const key = String(f?.question ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (!key || !f?.answer || seen.has(key)) continue;
      seen.add(key);
      faqs.push(f);
    }
    for (const [k, v] of Object.entries(d.policy ?? {}) as [keyof Drafts["policy"], string][]) {
      if (typeof v !== "string" || !v.trim()) continue;
      if (!policy[k] || (NOT_FOUND.test(policy[k]) && !NOT_FOUND.test(v))) policy[k] = v;
    }
    out.tone ||= typeof d.tone === "string" ? d.tone : "";
    out.profile_markdown ||= d.profile_markdown;
    out.business_type ||= d.business_type;
    out.greeting ||= d.greeting;
    if (!out.suggested_questions?.length && d.suggested_questions?.length) out.suggested_questions = d.suggested_questions;
  }
  return out;
}

/** Seconds a rate-limit error asks us to wait ("try again in 12.5s"), else a default. */
function retryAfterMs(message: string): number {
  const m = /try again in\s+(?:(\d+)m)?\s*([\d.]+)\s*s/i.exec(message);
  if (m) return Math.min(65_000, (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000 + 500);
  return 20_000;
}

/** Asks the LLM to draft FAQ pairs, a policy summary and a tone line from crawled text. */
export async function draftKnowledge(args: {
  businessName: string;
  pages: { title: string; url: string; text: string }[];
  products: { title: string; content: string }[];
  /** Details the owner typed in (about text, contact, hours, social bios). Highest priority. */
  ownerNotes?: string;
  model: string;
  budgetTokens?: number;
  /** Called between batches ("Reading part 2 of 3"). */
  onProgress?: (message: string) => void;
}): Promise<Drafts> {
  if (!llmKeyPresent()) throw new Error(`${llmKeyName()} is not set`);
  const openai = llmProvider() === "openai";
  const limit = requestTokenLimit();
  // Free/open endpoints are slower on huge prompts; small tiers read less in total.
  const budget = args.budgetTokens ?? (limit ? Math.min(12_000, limit * 2) : openai ? 24_000 : 60_000);
  const maxOut = limit ? Math.min(2_000, Math.floor(limit / 3)) : openai ? 4096 : 8000;
  const overhead = estimateTokens(ONBOARDING_SYSTEM) + estimateTokens(JSON.stringify(DRAFT_TOOL)) + 200;

  // Owner's own words first, then policy-like pages (the facts shoppers ask about most), then products.
  const ranked = [...args.pages].sort(
    (a, b) => Number(/polic|ship|deliver|return|refund|faq|contact|about|terms/i.test(b.url + b.title)) - Number(/polic|ship|deliver|return|refund|faq|contact|about|terms/i.test(a.url + a.title)),
  );
  const parts: string[] = [];
  if (args.ownerNotes?.trim()) parts.push(`<owner_provided>\n${args.ownerNotes.trim().slice(0, 20000)}\n</owner_provided>`);
  for (const p of ranked) parts.push(`<page url="${p.url}" title="${p.title.replace(/"/g, "'")}">\n${p.text}\n</page>`);
  const productSample = args.products.slice(0, 40).map((p) => `- ${p.title}: ${p.content.split("\n").slice(0, 3).join("; ")}`).join("\n");
  if (productSample) parts.push(`<products>\n${productSample}\n</products>`);

  const batches = planBatches(parts, budget, limit, overhead, maxOut);
  if (!batches.length) batches.push([]);
  const results: DraftInput[] = [];
  const usage = { input: 0, output: 0 };
  for (const [i, batch] of batches.entries()) {
    if (batches.length > 1) args.onProgress?.(`Writing drafts, part ${i + 1} of ${batches.length}`);
    const note = batches.length > 1 ? `\n\n(This is part ${i + 1} of ${batches.length} of the material. Draft only from what is here.)` : "";
    const userText = `Business: ${args.businessName}\n\n${batch.join("\n\n")}${note}\n\nDraft the knowledge now with save_drafts.`;
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await draftOnce({ openai, model: args.model, userText, maxOut });
        results.push(r.input);
        usage.input += r.usage.input;
        usage.output += r.usage.output;
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Rate limit per minute: wait as long as the provider asks, then retry this batch.
        if (attempt < 3 && /LLM API (429|413)|rate.?limit|tokens per minute|TPM/i.test(msg) && !/per day|TPD|RPD/i.test(msg)) {
          args.onProgress?.("The AI service asked us to slow down, waiting a moment…");
          await sleep(retryAfterMs(msg));
          continue;
        }
        // Keep what earlier batches produced rather than failing the whole import.
        if (results.length) {
          console.warn("[onboarding] draft batch failed, keeping earlier batches:", msg.slice(0, 200));
          break;
        }
        throw e;
      }
    }
    if (results.length < i + 1) break;
  }
  const input = mergeDrafts(results);
  return {
    faqs: input.faqs.slice(0, 40),
    policy: input.policy,
    tone: typeof input.tone === "string" ? input.tone.slice(0, 300) : "",
    profile_markdown: typeof input.profile_markdown === "string" ? input.profile_markdown.slice(0, 20000) : undefined,
    business_type: typeof input.business_type === "string" ? input.business_type.slice(0, 60) : undefined,
    greeting: typeof input.greeting === "string" ? input.greeting.slice(0, 300) : undefined,
    suggested_questions: Array.isArray(input.suggested_questions) ? input.suggested_questions.filter((q) => typeof q === "string" && q.trim()).slice(0, 3).map((q) => q.slice(0, 120)) : undefined,
    usage,
  };
}

async function draftOnce(o: { openai: boolean; model: string; userText: string; maxOut: number }): Promise<{ input: DraftInput; usage: Drafts["usage"] }> {
  if (o.openai) {
    const r = await openAiForcedToolCall({ model: resolveModel(o.model), system: ONBOARDING_SYSTEM, user: o.userText, tool: DRAFT_TOOL as unknown as ToolDef, maxTokens: o.maxOut });
    return { input: r.input as DraftInput, usage: r.usage };
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 180_000, maxRetries: 1 });
  const res = await client.messages.create({
    model: o.model,
    max_tokens: o.maxOut,
    system: ONBOARDING_SYSTEM,
    tools: [DRAFT_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "save_drafts" },
    messages: [{ role: "user", content: o.userText }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("The model did not return drafts");
  return { input: block.input as DraftInput, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } };
}

export function policyToText(policy: Drafts["policy"]): string {
  const label: Record<string, string> = {
    shipping: "Shipping and delivery",
    cod: "Cash on delivery",
    returns: "Returns",
    exchange: "Exchanges",
    payment: "Payment",
    hours: "Hours",
    contact: "Contact",
  };
  return Object.entries(policy ?? {})
    .filter(([, v]) => v && !/^not found on the website/i.test(v.trim()))
    .map(([k, v]) => `${label[k] ?? k}: ${v.trim()}`)
    .join("\n");
}

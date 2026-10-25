import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyUsage, type Usage } from "../cost";
import { buildKnowledgeBlock, neutralise, type KnowledgeSource } from "../knowledge";
import { openaiCompat } from "../llm/provider";
import type { LlmClient } from "../llm/types";
import { HINGLISH, TANGLISH } from "../language";
import { estimateTokens } from "../tokens";
import { fuseRanks } from "./chunk";
import { getEmbedder, toVector, type EmbeddingProvider } from "./embed";

export type Retrieved = {
  /** Always-included policy sources (stable → still cacheable). */
  pinnedText: string;
  /** Chunks relevant to this question. */
  retrievedText: string;
  titles: string[];
  chunkCount: number;
  query: string;
};

export interface Retriever {
  /** null → no index yet; the engine falls back to capped full-context and asks for a sync. */
  retrieve(args: {
    botId: string;
    sources: KnowledgeSource[];
    query: string;
    language: string;
    model: string;
    cap: number;
    /** Original plus English rewrite, already computed. When set, retrieve does not call the model again. */
    queries?: string[];
  }): Promise<Retrieved | null>;
  sync(botId: string): Promise<void>;
}

const NEEDS_REWRITE = new Set(["ta", "hi", "tanglish", "hinglish", "other"]);

export function needsQueryRewrite(language: string, text?: string): boolean {
  if (!NEEDS_REWRITE.has(language)) return false;
  // Order numbers, phone numbers and emoji have nothing to translate.
  if (text !== undefined && (text.match(/\p{L}/gu)?.length ?? 0) < 2) return false;
  return true;
}

/** First line only, without quotes or a "Query:" label. */
export function cleanRewrite(raw: string): string {
  const line = raw.trim().split("\n")[0] ?? "";
  return line
    .replace(/^(?:query|search query|english)\s*:\s*/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .slice(0, 200);
}

/**
 * The strings to search. Keyword search ANDs every word, so a Tanglish or Hindi
 * question mixed into the English rewrite matches nothing. Search each one alone
 * and merge the hits.
 */
export function queriesForRetrieval(original: string, rewritten: string | null | undefined): string[] {
  const a = original.replace(/\s+/g, " ").trim().slice(0, 500);
  const b = (rewritten ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const out = !a ? (b ? [b] : []) : !b || b.toLowerCase() === a.toLowerCase() ? [a] : [a, b];
  const kw = keywordQuery([a, b]);
  if (kw && !out.some((q) => q.toLowerCase() === kw)) out.push(kw);
  return out;
}

const STOPWORDS = new Set(
  (
    "a an the and or but if of to in on at by for from with about into over under is are was were be been being am do does did have has had " +
    "i me my we our you your he she it its they them their this that these those there here what which who whom whose when where why how " +
    "can could will would shall should may might must please tell know want need get got any some all much many more most very just also " +
    "hi hello hey thanks thank ok okay yes no not dont don't is it's im i'm sir madam bro one".toLowerCase()
  ).split(" "),
);

/**
 * Keyword search (websearch_to_tsquery) ANDs every word, so "Anna, philosophy books irukka?
 * Price evlo?" finds nothing even when a "Philosophy" page exists. This builds an OR query of
 * the content words ("philosophy or books or book or price"): any match counts and ts_rank
 * puts chunks that match more of them first. Filler words (English, Hinglish, Tanglish) are dropped.
 */
export function keywordQuery(texts: string[]): string {
  const terms: string[] = [];
  for (const t of texts) {
    for (const w of t.toLowerCase().match(/\p{L}[\p{L}\p{M}\p{N}'-]*/gu) ?? []) {
      const word = w.replace(/'s$/, "").replace(/['-]+$/, "");
      if (word.length < 3 || STOPWORDS.has(word) || HINGLISH.has(word) || TANGLISH.has(word)) continue;
      terms.push(word);
      // The 'simple' text config does not stem: also try the singular.
      if (/^[a-z]{4,}s$/.test(word) && !word.endsWith("ss")) terms.push(word.slice(0, -1));
    }
  }
  const unique = [...new Set(terms)].slice(0, 10);
  return unique.length >= 2 ? unique.join(" or ") : "";
}

/**
 * Non-English questions → a short English search query. Uses the small fallback
 * model when one is configured. Returns the original query for English, and on failure.
 */
export async function rewriteQuery(llm: LlmClient, model: string, query: string, language: string): Promise<string> {
  const prepared = await prepareSearch(llm, model, query, language);
  return prepared.english;
}

export async function prepareSearch(
  llm: LlmClient,
  model: string,
  query: string,
  language: string,
  opts?: { budgetLane?: "customer" | "demo" },
): Promise<{ english: string; queries: string[]; usage: Usage }> {
  const original = query.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!needsQueryRewrite(language, original)) return { english: original, queries: queriesForRetrieval(original, original), usage: emptyUsage() };
  const rewriteModel = openaiCompat.rewriteModel(model);
  try {
    let out = "";
    const turn = await llm.stream(
      {
        model: rewriteModel,
        maxTokens: 48,
        tools: [],
        // A search rewrite is optional: never let it eat the reply's time budget.
        signal: AbortSignal.timeout(REWRITE_TIMEOUT_MS),
        system: [{ text: "Rewrite the customer's message as a short English search query for a shop knowledge base. Keep product names, categories and genres (for example \"philosophy books\"), numbers and places. Drop greetings and filler words like anna, bhai, irukka, evlo, kitna. Output only the query." }],
        messages: [{ role: "user", content: original }],
        budgetLane: opts?.budgetLane,
      },
      (t) => (out += t),
    );
    const english = cleanRewrite(out) || original;
    return { english, queries: queriesForRetrieval(original, english), usage: turn.usage };
  } catch {
    return { english: original, queries: queriesForRetrieval(original, null), usage: emptyUsage() };
  }
}

const REWRITE_TIMEOUT_MS = 8_000;

type Row = { id: string; source_id: string; content: string; score: number };

/** Hybrid retrieval on Supabase: pinned policies + top chunks by vector and keyword search. */
export class SupabaseRetriever implements Retriever {
  constructor(
    private db: SupabaseClient,
    private llm: LlmClient,
    private embedder: EmbeddingProvider | null = getEmbedder(),
    private topK = 8,
  ) {}

  async sync(botId: string) {
    const { syncChunks } = await import("./index-sync");
    await syncChunks(botId);
  }

  async retrieve({ botId, sources, query, language, model, cap, queries: given }: Parameters<Retriever["retrieve"]>[0]): Promise<Retrieved | null> {
    const { count } = await this.db.from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("bot_id", botId);
    if (!count) return null;

    const pinned = buildKnowledgeBlock(sources.filter((s) => s.type === "policy"), Math.floor(cap * 0.4));
    const pinnedIds = new Set(pinned.includedIds);
    const queries = (given?.length ? given : (await prepareSearch(this.llm, model, query, language)).queries).map((q) => q.trim()).filter(Boolean).slice(0, 5);
    const vectors = this.embedder ? await this.embedder.embed(queries, "query").catch(() => null) : null;
    const groups: Row[][] = [];
    await Promise.all(
      queries.map(async (q, i) => {
        const [vec, text] = await Promise.all([
          vectors?.[i]
            ? Promise.resolve(this.db.rpc("match_chunks", { p_bot_id: botId, p_embedding: toVector(vectors[i]!), p_count: 16 }))
                .then((r) => (r.data ?? []) as Row[])
                .catch(() => [] as Row[])
            : Promise.resolve([] as Row[]),
          Promise.resolve(this.db.rpc("search_chunks_text", { p_bot_id: botId, p_query: q.slice(0, 300), p_count: 16 }))
            .then((r) => (r.data ?? []) as Row[])
            .catch(() => [] as Row[]),
        ]);
        groups.push(vec, text);
      }),
    );
    const byId = new Map<string, Row>();
    for (const rows of groups) for (const row of rows) byId.set(row.id, row);
    const ranked = fuseRanks(groups.map((rows) => rows.map((r) => r.id)))
      .map((id) => byId.get(id)!)
      .filter((r) => r && !pinnedIds.has(r.source_id));

    const budget = Math.floor(cap * 0.6);
    const picked: Row[] = [];
    let used = 0;
    for (const r of ranked) {
      if (picked.length >= this.topK) break;
      const t = estimateTokens(r.content);
      if (used + t > budget) continue;
      picked.push(r);
      used += t;
    }
    const titleOf = new Map(sources.map((s) => [s.id, `${s.type}: ${s.title}`]));
    return {
      pinnedText: pinned.text,
      retrievedText: picked.map((r) => `<source>\n${neutralise(r.content)}\n</source>`).join("\n\n"),
      titles: [...sources.filter((s) => pinnedIds.has(s.id)).map((s) => `${s.type}: ${s.title} (pinned)`), ...picked.map((r) => titleOf.get(r.source_id) ?? "chunk")],
      chunkCount: picked.length,
      query: queries.find((q) => q !== query) ?? queries[0] ?? query,
    };
  }
}

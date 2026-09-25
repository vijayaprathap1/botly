import type { SupabaseClient } from "@supabase/supabase-js";
import { buildKnowledgeBlock, neutralise, type KnowledgeSource } from "../knowledge";
import type { LlmClient } from "../llm/types";
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
  retrieve(args: { botId: string; sources: KnowledgeSource[]; query: string; language: string; model: string; cap: number }): Promise<Retrieved | null>;
  sync(botId: string): Promise<void>;
}

const NEEDS_REWRITE = new Set(["ta", "hi", "tanglish", "hinglish", "other"]);

/** Tamil/Hindi/mixed questions → a short English search query (knowledge is usually English). */
export async function rewriteQuery(llm: LlmClient, model: string, query: string, language: string): Promise<string> {
  if (!NEEDS_REWRITE.has(language)) return query;
  try {
    let out = "";
    await llm.stream(
      {
        model,
        maxTokens: 60,
        tools: [],
        system: [{ text: "Rewrite the customer's message as a short English search query for a shop's FAQ. Keep product names, numbers and places. Output only the query." }],
        messages: [{ role: "user", content: query.slice(0, 500) }],
      },
      (t) => (out += t),
    );
    out = out.trim().split("\n")[0]!.slice(0, 300);
    return out ? `${out} ${query}` : query;
  } catch {
    return query;
  }
}

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

  async retrieve({ botId, sources, query, language, model, cap }: Parameters<Retriever["retrieve"]>[0]): Promise<Retrieved | null> {
    const { count } = await this.db.from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("bot_id", botId);
    if (!count) return null;

    const pinned = buildKnowledgeBlock(sources.filter((s) => s.type === "policy"), Math.floor(cap * 0.4));
    const pinnedIds = new Set(pinned.includedIds);
    const q = await rewriteQuery(this.llm, model, query, language);

    const [vec, text] = await Promise.all([
      this.embedder
        ? this.embedder
            .embed([q], "query")
            .then(([v]) => this.db.rpc("match_chunks", { p_bot_id: botId, p_embedding: toVector(v!), p_count: 16 }))
            .then((r) => (r.data ?? []) as Row[])
            .catch(() => [] as Row[])
        : Promise.resolve([] as Row[]),
      this.db.rpc("search_chunks_text", { p_bot_id: botId, p_query: q.slice(0, 300), p_count: 16 }).then((r) => (r.data ?? []) as Row[]),
    ]);
    const byId = new Map<string, Row>([...vec, ...text].map((r) => [r.id, r]));
    const ranked = fuseRanks([vec.map((r) => r.id), text.map((r) => r.id)])
      .map((id) => byId.get(id)!)
      .filter((r) => !pinnedIds.has(r.source_id));

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
      query: q,
    };
  }
}

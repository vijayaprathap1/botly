import "server-only";
import { config } from "../config";
import { supabaseAdmin } from "../supabase/admin";
import { chunkSource } from "./chunk";
import { getEmbedder, toVector } from "./embed";

/**
 * Brings knowledge_chunks in line with the bot's approved sources.
 * Only runs when approved knowledge is over the full-context cap (retrieval mode);
 * below the cap the whole knowledge base goes into the prompt and no index is needed.
 */
export async function syncChunks(botId: string, force = false): Promise<{ mode: "full" | "retrieval"; added: number; removed: number; embedded: boolean }> {
  const db = supabaseAdmin();
  const { data: sources, error } = await db.from("knowledge_sources").select("id, type, title, content, token_count, updated_at").eq("bot_id", botId).eq("status", "approved");
  if (error) throw new Error(error.message);
  const total = (sources ?? []).reduce((s, r) => s + (r.token_count ?? 0), 0);
  if (!force && total <= config.knowledgeTokenCap) return { mode: "full", added: 0, removed: 0, embedded: false };

  const embedder = getEmbedder();
  const { data: existing } = await db.from("knowledge_chunks").select("source_id, source_updated_at, embedding_model").eq("bot_id", botId);
  const have = new Map<string, { updated: string; model: string | null }>();
  for (const c of existing ?? []) have.set(c.source_id as string, { updated: c.source_updated_at as string, model: c.embedding_model as string | null });
  const approved = new Map((sources ?? []).map((s) => [s.id as string, s]));

  // Remove chunks for sources that are no longer approved.
  const stale = [...have.keys()].filter((id) => !approved.has(id));
  let removed = 0;
  if (stale.length) {
    const { count } = await db.from("knowledge_chunks").delete({ count: "exact" }).eq("bot_id", botId).in("source_id", stale);
    removed += count ?? 0;
  }
  // (Re)build chunks for new or edited sources, or when an embedder appears.
  const todo = (sources ?? []).filter((s) => {
    const h = have.get(s.id as string);
    return !h || new Date(h.updated).getTime() !== new Date(s.updated_at as string).getTime() || (embedder && h.model !== embedder.model);
  });
  let added = 0;
  for (const s of todo) {
    const chunks = chunkSource({ type: s.type as string, title: s.title as string, content: s.content as string });
    const vectors = embedder ? await embedder.embed(chunks.map((c) => c.content), "document") : null;
    await db.from("knowledge_chunks").delete().eq("source_id", s.id);
    const rows = chunks.map((c, i) => ({
      source_id: s.id,
      bot_id: botId,
      chunk_index: c.index,
      content: c.content,
      token_count: c.tokens,
      source_updated_at: s.updated_at,
      embedding: vectors ? toVector(vectors[i]!) : null,
      embedding_model: embedder?.model ?? null,
    }));
    if (rows.length) {
      const { error: e } = await db.from("knowledge_chunks").insert(rows);
      if (e) throw new Error(e.message);
      added += rows.length;
    }
  }
  return { mode: "retrieval", added, removed, embedded: Boolean(embedder) };
}

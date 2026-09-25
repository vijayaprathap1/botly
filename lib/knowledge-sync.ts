import "server-only";

/**
 * Hook called after any knowledge change. Keeps the retrieval index (Phase 2)
 * in step with approved sources. Never throws into the caller.
 */
export async function afterKnowledgeChange(botId: string): Promise<void> {
  try {
    const { syncChunks } = await import("./retrieval/index-sync");
    await syncChunks(botId);
  } catch (e) {
    console.error("[knowledge-sync]", e instanceof Error ? e.message : e);
  }
}

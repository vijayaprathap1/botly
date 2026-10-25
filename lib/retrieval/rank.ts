/** Token overlap against chunk text. Used by tests and the offline language eval, not by Postgres. */
export function keywordRank(query: string, chunks: { id: string; content: string }[]): string[] {
  const tokens = query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  if (!tokens.length) return [];
  return chunks
    .map((c) => {
      const hay = c.content.toLowerCase();
      const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
      return { id: c.id, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .map((x) => x.id);
}

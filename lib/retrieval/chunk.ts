import { estimateTokens } from "../tokens";

export type Chunk = { index: number; content: string; tokens: number };

/**
 * Splits a source into ~maxTokens chunks on paragraph/line boundaries, each
 * prefixed with the source type and title so a chunk stands on its own.
 */
export function chunkSource(src: { type: string; title: string; content: string }, maxTokens = 350, overlapLines = 1): Chunk[] {
  let lines = src.content.replace(/\r\n?/g, "\n").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  // A crawled page's "Category: Books > Poetry" line goes into every chunk's header, so the
  // genre or category stays searchable in the later chunks of a long listing page too.
  const category = lines[0]?.startsWith("Category: ") && lines[0].length <= 300 ? lines[0] : "";
  if (category) lines = lines.slice(1);
  const header = `[${src.type}] ${src.title}${category ? `\n${category}` : ""}`.trim();
  // Split overly long lines on sentence boundaries.
  const units: string[] = [];
  for (const l of lines) {
    if (estimateTokens(l) <= maxTokens) units.push(l);
    else units.push(...(l.match(/[^.!?।]+[.!?।]*\s*/g) ?? [l]).map((s) => s.trim()).filter(Boolean));
  }
  const chunks: Chunk[] = [];
  let cur: string[] = [];
  let tokens = estimateTokens(header);
  const flush = () => {
    if (!cur.length) return;
    const content = `${header}\n${cur.join("\n")}`;
    chunks.push({ index: chunks.length, content, tokens: estimateTokens(content) });
    cur = cur.slice(-overlapLines);
    tokens = estimateTokens(header) + cur.reduce((s, u) => s + estimateTokens(u), 0);
  };
  for (const u of units) {
    const t = estimateTokens(u);
    if (tokens + t > maxTokens && cur.length) flush();
    cur.push(u.length > 4000 ? u.slice(0, 4000) : u);
    tokens += t;
  }
  if (cur.length && (chunks.length === 0 || cur.length > overlapLines)) flush();
  return chunks;
}

/** Reciprocal-rank fusion of several ranked id lists. */
export function fuseRanks(lists: string[][], k = 60): string[] {
  const score = new Map<string, number>();
  for (const list of lists) list.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (k + i + 1)));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

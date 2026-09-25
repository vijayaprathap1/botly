import { estimateTokens } from "./tokens";

export type KnowledgeSource = {
  id: string;
  type: "page" | "faq" | "policy" | "product" | "file" | "note";
  title: string;
  url: string | null;
  content: string;
  updated_at?: string;
};

// Most decision-critical knowledge first, so the cap trims long crawled pages before policies.
const TYPE_ORDER: Record<KnowledgeSource["type"], number> = { policy: 0, faq: 1, product: 2, note: 3, file: 4, page: 5 };

/** Stop knowledge text from closing our tags or pretending to be the system. */
export function neutralise(s: string): string {
  return s.replace(/<(\/?)(knowledge|source|system|instructions)/gi, "‹$1$2");
}
const attr = (s: string) => neutralise(s).replace(/["\n\r<>]/g, " ").slice(0, 300);

export type KnowledgeBlock = {
  text: string;
  tokens: number;
  includedIds: string[];
  excludedIds: string[];
  overCap: boolean;
};

/**
 * Full-context mode: every approved source concatenated in a stable order
 * (stable order = stable prefix = prompt-cache hits), cut at the token cap.
 */
export function buildKnowledgeBlock(sources: KnowledgeSource[], cap: number): KnowledgeBlock {
  const sorted = [...sources].sort(
    (a, b) =>
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );
  const parts: string[] = [];
  const includedIds: string[] = [];
  const excludedIds: string[] = [];
  let tokens = 0;
  for (const s of sorted) {
    const urlAttr = s.url ? ` url="${attr(s.url)}"` : "";
    const piece = `<source type="${s.type}" title="${attr(s.title)}"${urlAttr}>\n${neutralise(s.content.trim())}\n</source>`;
    const t = estimateTokens(piece);
    if (tokens + t > cap) {
      excludedIds.push(s.id);
      continue;
    }
    parts.push(piece);
    includedIds.push(s.id);
    tokens += t;
  }
  return {
    text: parts.length ? parts.join("\n\n") : "(No approved knowledge yet.)",
    tokens,
    includedIds,
    excludedIds,
    overCap: excludedIds.length > 0,
  };
}

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

/**
 * The same shape the page-title guard and the FAQ matcher already refuse:
 * text that addresses the model, or that says to ignore previous instructions.
 * Used on demo FAQ drafts before they are auto-approved.
 */
export const PROMPT_INJECTION_RE =
  /\b(?:system|assistant|developer|admin(?:istrator)?|ai|bot|chatbot|llm|model)\b[^.|\-–—]{0,40}(?::|note|message|prompt|instruction)|\b(?:ignore|disregard|forget)\b.{0,40}\b(?:rules?|instructions?|prompt|above|previous)\b|\b(?:instructions?|prompt)\s*:|\btell (?:every|all|the) (?:visitors?|customers?|users?)\b|\byou (?:are|must|should) now\b|\[\s*admin message|\bsystem prompt\b/i;

export function looksLikePromptInjection(text: string | null | undefined): boolean {
  return PROMPT_INJECTION_RE.test(text ?? "");
}

/** Split drafted FAQs into ones safe to approve and ones that look like prompt injection. */
export function flagUnsafeFaqDrafts<T extends { question: string; answer: string }>(faqs: T[]): { safe: T[]; flagged: T[] } {
  const safe: T[] = [];
  const flagged: T[] = [];
  for (const f of faqs) {
    if (looksLikePromptInjection(`${f.question}\n${f.answer}`)) flagged.push(f);
    else safe.push(f);
  }
  return { safe, flagged };
}

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

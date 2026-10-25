import type { KnowledgeSource } from "./knowledge";

/**
 * Answer a visitor from an approved FAQ only when the question is the same
 * question (or a trivial rephrase). Anything ambiguous goes to the model.
 */
export type FaqHit = { sourceId: string; title: string; answer: string };

const INJECTION = /ignore (all |your )?(previous |prior )?(rules|instructions)|system prompt|you are now|\[?\s*admin message/i;
const POLITE_PREFIX = /^(?:please|pls|kindly|can you|could you|would you|will you|tell me|i want to know|do you know|hey|hi|hello)\s+/;
const POLITE_SUFFIX = /\s+(?:please|pls|thanks|thank you|thankyou)$/;

export function normalizeQuestion(raw: string): string {
  let s = raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 3; i++) {
    const next = s.replace(POLITE_PREFIX, "").replace(POLITE_SUFFIX, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function usableAnswer(answer: string): boolean {
  const t = answer.trim();
  if (t.length < 2 || t.length > 2_000) return false;
  if (/^not found on the website/i.test(t)) return false;
  return true;
}

function faqFields(source: KnowledgeSource): { questions: string[]; answer: string } {
  const content = source.content.trim();
  const qLine = /(?:^|\n)\s*Q:\s*(.+)/i.exec(content)?.[1]?.trim();
  const aLine = /(?:^|\n)\s*A:\s*([\s\S]+)/i.exec(content)?.[1]?.trim() ?? "";
  const questions = [source.title, qLine].filter((q): q is string => Boolean(q && q.trim()));
  return { questions, answer: aLine || content };
}

/** Distance above `max` is returned as max + 1 so callers can stop early. */
function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    const ai = a[i - 1];
    for (let j = 1; j <= b.length; j++) {
      const cost = ai === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] ?? max + 1;
}

function closeEnough(question: string, message: string): boolean {
  if (!question || !message) return false;
  if (question === message) return message.length >= 8;
  if (message.length < 12 || question.length < 12) return false;
  const max = Math.max(question.length, message.length);
  const min = Math.min(question.length, message.length);
  if (max > 240 || min / max < 0.85) return false;
  return levenshtein(question, message, 2) <= 2;
}

export function matchApprovedFaq(sources: KnowledgeSource[], message: string): FaqHit | null {
  const raw = message.trim();
  if (!raw || raw.length > 500 || INJECTION.test(raw)) return null;
  const norm = normalizeQuestion(raw);
  if (norm.length < 8) return null;
  const hits: FaqHit[] = [];
  for (const source of sources) {
    if (source.type !== "faq") continue;
    const { questions, answer } = faqFields(source);
    if (!usableAnswer(answer)) continue;
    if (!questions.some((q) => closeEnough(normalizeQuestion(q), norm))) continue;
    hits.push({ sourceId: source.id, title: source.title, answer: answer.trim() });
  }
  return hits.length === 1 ? hits[0]! : null;
}

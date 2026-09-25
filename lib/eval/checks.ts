import { detectLanguage } from "../language";
import { normalizePhone } from "../validation/phone";
import type { EvalCase } from "./fixture";

export type TurnResult = { text: string; tools: { name: string; input: unknown; result: unknown }[]; firstTokenMs: number | null; latencyMs: number; costUsd: number };
export type CaseResult = { id: string; category: string; pass: boolean; failures: string[]; reply: string; tools: string[]; firstTokenMs: number | null; costUsd: number };

const AMOUNT = /(?:₹|rs\.?|inr)\s?(\d[\d,]*(?:\.\d+)?)/gi;
export function amounts(text: string): number[] {
  return [...text.matchAll(AMOUNT)].map((m) => Number(m[1]!.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
}

/** Applies every check in the case to the conversation's turns. */
export function checkCase(c: EvalCase, turns: TurnResult[], knowledgeText: string, savedLeadPhones: string[]): CaseResult {
  const last = turns[turns.length - 1] ?? { text: "", tools: [], firstTokenMs: null, latencyMs: 0, costUsd: 0 };
  const reply = last.text;
  const lower = reply.toLowerCase();
  const allTools = turns.flatMap((t) => t.tools);
  const failures: string[] = [];

  for (const group of c.contains_any ?? []) {
    if (!group.some((alt) => lower.includes(alt.toLowerCase()))) failures.push(`missing one of: ${group.join(" | ")}`);
  }
  for (const bad of c.not_contains ?? []) {
    if (lower.includes(bad.toLowerCase())) failures.push(`must not contain: ${bad}`);
  }
  if (c.tool_called && !last.tools.some((t) => t.name === c.tool_called)) failures.push(`expected tool ${c.tool_called}`);
  if (c.tool_not_called && last.tools.some((t) => t.name === c.tool_not_called)) failures.push(`tool ${c.tool_not_called} must not be called`);
  if (c.language) {
    const got = detectLanguage(reply);
    if (got !== c.language) failures.push(`reply language ${got}, expected ${c.language}`);
  }
  if (c.no_unknown_prices) {
    const known = new Set(amounts(knowledgeText));
    const unknown = amounts(reply).filter((a) => !known.has(a));
    if (unknown.length) failures.push(`invented amount(s): ${unknown.join(", ")}`);
  }
  if (c.lead) {
    const want = normalizePhone(c.lead.phone);
    const called = allTools.some((t) => t.name === "capture_lead" || t.name === "handoff_to_human");
    if (!called) failures.push("expected capture_lead or handoff_to_human");
    if (!want.ok || !savedLeadPhones.includes(want.e164)) failures.push(`lead with phone ${c.lead.phone} was not saved`);
  }
  return {
    id: c.id,
    category: c.category,
    pass: failures.length === 0,
    failures,
    reply,
    tools: allTools.map((t) => t.name),
    firstTokenMs: last.firstTokenMs,
    costUsd: turns.reduce((s, t) => s + t.costUsd, 0),
  };
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

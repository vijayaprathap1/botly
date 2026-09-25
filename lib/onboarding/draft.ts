import Anthropic from "@anthropic-ai/sdk";
import { DRAFT_TOOL, ONBOARDING_SYSTEM } from "../prompts/onboarding";
import { estimateTokens } from "../tokens";

export type Drafts = {
  faqs: { question: string; answer: string; source_url?: string }[];
  policy: Record<"shipping" | "cod" | "returns" | "exchange" | "payment" | "hours" | "contact", string>;
  tone: string;
  profile_markdown?: string;
  business_type?: string;
  greeting?: string;
  suggested_questions?: string[];
  usage: { input: number; output: number };
};

/** Asks Claude to draft FAQ pairs, a policy summary and a tone line from crawled text. */
export async function draftKnowledge(args: {
  businessName: string;
  pages: { title: string; url: string; text: string }[];
  products: { title: string; content: string }[];
  /** Details the owner typed in (about text, contact, hours, social bios). Highest priority. */
  ownerNotes?: string;
  model: string;
  budgetTokens?: number;
}): Promise<Drafts> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const budget = args.budgetTokens ?? 60_000;
  const parts: string[] = [];
  let used = 0;
  // Policy-like pages first: they carry the facts shoppers ask about most.
  const ranked = [...args.pages].sort(
    (a, b) => Number(/polic|ship|deliver|return|refund|faq|contact|about|terms/i.test(b.url + b.title)) - Number(/polic|ship|deliver|return|refund|faq|contact|about|terms/i.test(a.url + a.title)),
  );
  for (const p of ranked) {
    const piece = `<page url="${p.url}" title="${p.title.replace(/"/g, "'")}">\n${p.text}\n</page>`;
    const t = estimateTokens(piece);
    if (used + t > budget) continue;
    parts.push(piece);
    used += t;
  }
  if (args.ownerNotes?.trim()) parts.unshift(`<owner_provided>\n${args.ownerNotes.trim().slice(0, 20000)}\n</owner_provided>`);
  const productSample = args.products.slice(0, 40).map((p) => `- ${p.title}: ${p.content.split("\n").slice(0, 3).join("; ")}`).join("\n");
  if (productSample) parts.push(`<products>\n${productSample}\n</products>`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 180_000, maxRetries: 1 });
  const res = await client.messages.create({
    model: args.model,
    max_tokens: 8000,
    system: ONBOARDING_SYSTEM,
    tools: [DRAFT_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "save_drafts" },
    messages: [{ role: "user", content: `Business: ${args.businessName}\n\n${parts.join("\n\n")}\n\nDraft the knowledge now with save_drafts.` }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  // (ownerNotes are treated like pages: facts the assistant may use.)
  if (!block || block.type !== "tool_use") throw new Error("The model did not return drafts");
  const input = block.input as Omit<Drafts, "usage">;
  return {
    faqs: Array.isArray(input.faqs) ? input.faqs.filter((f) => f?.question && f?.answer).slice(0, 40) : [],
    policy: input.policy,
    tone: typeof input.tone === "string" ? input.tone.slice(0, 300) : "",
    profile_markdown: typeof input.profile_markdown === "string" ? input.profile_markdown.slice(0, 20000) : undefined,
    business_type: typeof input.business_type === "string" ? input.business_type.slice(0, 60) : undefined,
    greeting: typeof input.greeting === "string" ? input.greeting.slice(0, 300) : undefined,
    suggested_questions: Array.isArray(input.suggested_questions) ? input.suggested_questions.filter((q) => typeof q === "string" && q.trim()).slice(0, 3).map((q) => q.slice(0, 120)) : undefined,
    usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
  };
}

export function policyToText(policy: Drafts["policy"]): string {
  const label: Record<string, string> = {
    shipping: "Shipping and delivery",
    cod: "Cash on delivery",
    returns: "Returns",
    exchange: "Exchanges",
    payment: "Payment",
    hours: "Hours",
    contact: "Contact",
  };
  return Object.entries(policy ?? {})
    .filter(([, v]) => v && !/^not found on the website/i.test(v.trim()))
    .map(([k, v]) => `${label[k] ?? k}: ${v.trim()}`)
    .join("\n");
}

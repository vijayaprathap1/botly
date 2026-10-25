/**
 * Five-language check for a tiny bookshop. The unit tests mock the model.
 * `npm run eval:languages` is the opt-in run against the real model, on this
 * fixture only — it never reads a customer's bot or production data.
 */
import type { KnowledgeSource } from "../knowledge";
import type { Lang } from "../language";
import { DEFAULT_BRANDING, type BotWithOrg } from "../types";
import type { Script } from "../reply-style";

export type BookChunk = { id: string; content: string };

export const BOOKSHOP_CHUNKS: BookChunk[] = [
  { id: "romance", content: "[product] Romance\nCategory: Romance. Romance books. Example: A Court of Thorns, price £12.99." },
  { id: "philosophy", content: "[product] Philosophy\nCategory: Philosophy. Philosophy books. Example: Meditations, price £9.50." },
  { id: "classics", content: "[product] Classics\nCategory: Classics. Classic literature. Example: Pride and Prejudice, price £8.00." },
  { id: "mystery", content: "[product] Mystery\nCategory: Mystery. Mystery novels. Example: The Moonstone, price £11.00." },
];

export type LanguageCase = {
  id: string;
  language: Lang;
  script: Script;
  message: string;
  topic: string;
  /** Fact that must be available in the retrieved chunk. */
  fact: string;
  /** A reply in the right language and script, for the offline matcher. */
  sampleReply: string;
};

export const LANGUAGE_CASES: LanguageCase[] = [
  {
    id: "en-romance",
    language: "en",
    script: "latin",
    message: "Which romance books do you have?",
    topic: "romance",
    fact: "Romance",
    sampleReply: "We have romance books in the Romance category, for example A Court of Thorns at £12.99.",
  },
  {
    id: "hi-romance",
    language: "hi",
    script: "devanagari",
    message: "रोमांस वाली किताबें कौन सी हैं?",
    topic: "romance",
    fact: "A Court of Thorns",
    sampleReply: "हमारे पास रोमांस की किताबें हैं, उदाहरण के लिए A Court of Thorns, कीमत £12.99।",
  },
  {
    id: "hinglish-classics",
    language: "hinglish",
    script: "latin",
    message: "Classics ki kitaabein hain kya? Kaunsi hain?",
    topic: "classics",
    fact: "Classics",
    sampleReply: "Haan, classics ki kitaabein hain. Ek example Pride and Prejudice hai, price £8.00.",
  },
  {
    id: "ta-mystery",
    language: "ta",
    script: "tamil",
    message: "மர்ம நாவல்கள் இருக்கா? என்ன விலை?",
    topic: "mystery",
    fact: "The Moonstone",
    sampleReply: "மர்ம நாவல்கள் உள்ளன. உதாரணம் The Moonstone, விலை £11.00.",
  },
  {
    id: "tanglish-philosophy",
    language: "tanglish",
    script: "latin",
    message: "philosophy books pathi sollunga, enna irukku?",
    topic: "philosophy",
    fact: "Philosophy",
    sampleReply: "Philosophy books irukku, sollunga enna irukku. Category Philosophy, price £9.50.",
  },
];

/** In-memory bookshop. Plan is starter so a live eval does not spend a trial. */
export function bookshopBot(): { bot: BotWithOrg; knowledge: KnowledgeSource[] } {
  const now = new Date().toISOString();
  const bot: BotWithOrg = {
    id: "00000000-0000-4000-8000-00000000b0c1",
    org_id: "00000000-0000-4000-8000-00000000a0c1",
    name: "Page & Co",
    public_key: "pk_lang_eval_bookshop",
    test_token: "tt_lang_eval_bookshop_token",
    active: true,
    status: "live",
    allowed_origins: ["http://localhost:3000"],
    model: "",
    tone: "Warm and short.",
    tone_suggestion: null,
    languages: ["en", "ta", "hi"],
    greeting: "Hello from Page & Co.",
    nudge: null,
    suggested_questions: [],
    branding: { ...DEFAULT_BRANDING, assistant_name: "Page" },
    business_hours: { mon: [["10:00", "18:00"]], tue: [["10:00", "18:00"]], wed: [["10:00", "18:00"]], thu: [["10:00", "18:00"]], fri: [["10:00", "18:00"]], sat: [], sun: [] },
    notify_emails: [],
    notify_whatsapp: [],
    fallback_contact: {},
    privacy_url: null,
    monthly_conversation_quota: null,
    website_url: "https://books.example",
    updated_at: now,
    created_at: now,
    org: {
      id: "00000000-0000-4000-8000-00000000a0c1",
      name: "Page & Co",
      business_type: "bookshop",
      plan: "starter",
      monthly_conversation_quota: 2000,
      timezone: "Asia/Kolkata",
      retention_months: 12,
      minutes_saved_per_conversation: 3,
      suspended: false,
    },
  };
  const knowledge: KnowledgeSource[] = BOOKSHOP_CHUNKS.map((c) => ({
    id: c.id,
    type: "product" as const,
    title: c.id,
    url: null,
    content: c.content,
  }));
  return { bot, knowledge };
}

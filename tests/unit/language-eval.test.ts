import { describe, expect, it } from "vitest";
import { LANGUAGE_CASES, BOOKSHOP_CHUNKS } from "@/lib/eval/languages";
import { detectLanguage } from "@/lib/language";
import { declinesKnowledge, dominantScript, offerDecline, offerDecision, replyInstruction, replyMatchesVisitor } from "@/lib/reply-style";
import { fuseRanks } from "@/lib/retrieval/chunk";
import { keywordRank } from "@/lib/retrieval/rank";
import { prepareSearch, queriesForRetrieval } from "@/lib/retrieval/retriever";
import type { LlmClient, LlmRequest } from "@/lib/llm/types";

const knowledge = BOOKSHOP_CHUNKS.map((c) => c.content).join("\n");

describe("language eval fixture", () => {
  it("detects language and script for each visitor, and a matching sample reply", () => {
    for (const c of LANGUAGE_CASES) {
      expect(detectLanguage(c.message), c.id).toBe(c.language);
      expect(dominantScript(c.message), c.id).toBe(c.script);
      expect(replyInstruction(c.message).length, c.id).toBeGreaterThan(20);
      expect(detectLanguage(c.sampleReply), c.id).toBe(c.language);
      expect(replyMatchesVisitor(c.message, c.sampleReply).ok, c.id).toBe(true);
      expect(declinesKnowledge(c.sampleReply), c.id).toBe(false);
      expect(c.sampleReply.toLowerCase(), c.id).toContain(c.fact.toLowerCase());
    }
  });

  it("rejects a Devanagari reply to Roman Hinglish", () => {
    const hinglish = LANGUAGE_CASES.find((c) => c.language === "hinglish")!;
    const wrong = replyMatchesVisitor(hinglish.message, "हाँ, क्लासिक्स की किताबें हैं।");
    expect(wrong.ok).toBe(false);
  });

  it("rewrites a Hindi question and the English query retrieves Romance", async () => {
    const hindi = LANGUAGE_CASES.find((c) => c.id === "hi-romance")!;
    const llm: LlmClient & { calls: LlmRequest[] } = {
      calls: [],
      async stream(req, onText) {
        this.calls.push(req);
        onText("romance books");
        return { content: [], stopReason: "end_turn", usage: { input: 4, output: 2, cacheRead: 0, cacheWrite: 0 }, firstTokenMs: 1 };
      },
    };
    const prepared = await prepareSearch(llm, "openai/gpt-oss-120b", hindi.message, hindi.language);
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.tools).toEqual([]);
    expect(prepared.queries).toEqual(queriesForRetrieval(hindi.message, "romance books"));
    expect(keywordRank(hindi.message, BOOKSHOP_CHUNKS)).toEqual([]);
    const ranked = fuseRanks(prepared.queries.map((q) => keywordRank(q, BOOKSHOP_CHUNKS)));
    expect(ranked[0]).toBe("romance");
    expect(BOOKSHOP_CHUNKS.find((c) => c.id === ranked[0])!.content).toContain(hindi.fact);
  });

  it("a Tanglish philosophy question retrieves Philosophy once it is rewritten", async () => {
    const tanglish = LANGUAGE_CASES.find((c) => c.id === "tanglish-philosophy")!;
    const llm: LlmClient = {
      async stream(_req, onText) {
        onText("philosophy books");
        return { content: [], stopReason: "end_turn", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, firstTokenMs: 1 };
      },
    };
    // Postgres websearch ANDs every word, so Tanglish tokens knock out an English hit.
    const andHits = (query: string) => {
      const tokens = query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
      return BOOKSHOP_CHUNKS.filter((c) => tokens.every((t) => c.content.toLowerCase().includes(t))).map((c) => c.id);
    };
    expect(andHits(tanglish.message)).toEqual([]);
    const prepared = await prepareSearch(llm, "m", tanglish.message, "tanglish");
    expect(andHits(prepared.english)).toEqual(["philosophy"]);
    const ranked = fuseRanks(prepared.queries.map((q) => keywordRank(q, BOOKSHOP_CHUNKS)));
    expect(ranked[0]).toBe("philosophy");
  });
});

describe("offers and unanswered detection", () => {
  it("denies a named coupon that is not in the knowledge, in the visitor's language", () => {
    expect(offerDecision("Do you have a 90% coupon?", knowledge)).toBe("deny");
    expect(offerDecision("क्या ९०% कूपन है?", knowledge)).toBe("deny");
    expect(offerDecline("en")).toBe("I can't confirm any discount or coupon code. I can connect you with the team for other questions.");
    expect(offerDecline("hinglish")).toMatch(/Roman|confirm nahi/);
    expect(offerDecline("hi")).toMatch(/पुष्टि नहीं/);
    expect(offerDecision("Is the Romance book £12.99?", knowledge)).toBe("allow");
  });

  it("allows a discount only when that exact offer is written down", () => {
    expect(offerDecision("Is there a 10% discount?", "Category: Romance. 10% off this week.")).toBe("allow");
    expect(offerDecision("Is there a 90% discount?", "Category: Romance. 10% off this week.")).toBe("deny");
    expect(offerDecision("Any discount on classics?", knowledge)).toBe("deny");
  });

  it("catches an I-don't-know reply in Tanglish and Hindi, not a real answer", () => {
    expect(declinesKnowledge("Sorry, I don't have the information about romance books.")).toBe(true);
    expect(declinesKnowledge("Romance books pathi enakku theriyala, information illa.")).toBe(true);
    expect(declinesKnowledge("मुझे यह जानकारी नहीं है।")).toBe(true);
    expect(declinesKnowledge("தகவல் இல்லை. குழுவிடம் கேட்கலாம்.")).toBe(true);
    expect(declinesKnowledge("We have romance novels from £12.99.")).toBe(false);
    expect(declinesKnowledge(offerDecline("en"))).toBe(false);
  });
});

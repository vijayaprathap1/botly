import { describe, expect, it } from "vitest";
import { detectLanguage } from "@/lib/language";
import { declinesKnowledge, replyInstruction, replyMatchesVisitor, replyReminder } from "@/lib/reply-style";
import { keywordQuery, queriesForRetrieval } from "@/lib/retrieval/retriever";
import { keywordRank } from "@/lib/retrieval/rank";

/** QA retest 2026-10-25, item 1 fixtures. */
const TANGLISH_Q = "Anna, philosophy books irukka? Price evlo?";
const TAMIL_NO_INFO =
  "மன்னிக்கவும், philosophy புத்தகங்கள் மற்றும் அவற்றின் விலை பற்றிய தகவல் எனக்கு இல்லை. வேறு ஏதாவது உதவி வேண்டுமா?";

/** Postgres websearch_to_tsquery semantics, enough for the test: words AND, "or" ORs. */
function tsMatch(query: string, content: string): boolean {
  const hay = new Set(content.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []);
  return query
    .toLowerCase()
    .split(/\s+or\s+/)
    .some((part) => (part.match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).every((w) => hay.has(w)));
}

const CHUNKS = [
  { id: "philosophy", content: "[page] Philosophy | Books to Scrape\nCategory: Philosophy\n11 results. Sophie's World £15.94 The Stranger £17.44" },
  { id: "travel", content: "[page] Travel | Books to Scrape\nCategory: Travel\nIt's Only the Himalayas £45.17" },
  { id: "poetry", content: "[page] A Light in the Attic | Books to Scrape\nCategory: Books > Poetry\nA Light in the Attic £51.77" },
];

describe("Tanglish detection and reply script", () => {
  it("labels the QA message Tanglish and asks for Roman letters", () => {
    expect(detectLanguage(TANGLISH_Q)).toBe("tanglish");
    expect(replyInstruction(TANGLISH_Q)).toMatch(/Tanglish using Roman letters only/);
    expect(replyInstruction(TANGLISH_Q)).toMatch(/even if earlier messages/);
    expect(replyReminder(TANGLISH_Q)).toMatch(/no Tamil script/);
    expect(replyReminder("Is COD available?")).toBe("");
  });
  it("flags a Tamil-script reply to a Tanglish question", () => {
    expect(replyMatchesVisitor(TANGLISH_Q, TAMIL_NO_INFO).ok).toBe(false);
    expect(replyMatchesVisitor(TANGLISH_Q, "Aama, philosophy books irukku. Sophie's World £15.94.").ok).toBe(true);
  });
  it("detects more Tanglish phrasings", () => {
    expect(detectLanguage("philosophy books evalo price?")).toBe("tanglish");
    expect(detectLanguage("poetry books kedaikuma?")).toBe("tanglish");
  });
});

describe("unanswered detection catches the QA replies", () => {
  it.each([
    TAMIL_NO_INFO,
    "philosophy பற்றிய தகவல் இல்லை.",
    "Sorry, I don't have information about philosophy books.",
    "I don't have specific details about that title's genre.",
    "I couldn't find any information about that book.",
    "Philosophy books pathi info enakku illa.",
    "Philosophy books pathi details illa, team-kitta kelunga.",
  ])("%s", (reply) => {
    expect(declinesKnowledge(reply)).toBe(true);
  });
  it("does not flag a real answer", () => {
    expect(declinesKnowledge("Aama, philosophy books irukku: Sophie's World £15.94.")).toBe(false);
    expect(declinesKnowledge("ஆம், philosophy புத்தகங்கள் உள்ளன. Sophie's World £15.94.")).toBe(false);
  });
});

describe("keyword search finds the philosophy category", () => {
  it("the raw Tanglish question matches nothing with AND semantics", () => {
    expect(CHUNKS.filter((c) => tsMatch(TANGLISH_Q, c.content))).toEqual([]);
  });
  it("the OR keyword query drops filler words and matches the Philosophy page first", () => {
    const kw = keywordQuery([TANGLISH_Q]);
    expect(kw.split(" or ")).toEqual(expect.arrayContaining(["philosophy", "books", "book", "price"]));
    expect(kw).not.toMatch(/\b(anna|irukka|evlo)\b/);
    const queries = queriesForRetrieval(TANGLISH_Q, "philosophy books price");
    expect(queries).toContain(kw.includes("philosophy") ? queries.at(-1) : "");
    const hits = CHUNKS.filter((c) => tsMatch(queries.at(-1)!, c.content)).map((c) => c.id);
    expect(hits).toContain("philosophy");
    expect(keywordRank(queries.at(-1)!.replace(/ or /g, " "), CHUNKS)[0]).toBe("philosophy");
  });
  it("finds the genre of a full title (English question)", () => {
    const q = queriesForRetrieval("What genre is A Light in the Attic?", null);
    const kw = q.at(-1)!;
    expect(kw).toMatch(/light or attic|attic/);
    expect(CHUNKS.filter((c) => tsMatch(kw, c.content)).map((c) => c.id)).toContain("poetry");
    expect(CHUNKS.filter((c) => tsMatch("What genre is A Light in the Attic?", c.content))).toEqual([]);
  });
});

import { isThanksOnly } from "@/lib/chat/engine";
describe("QA retest 2026-10-25 item 5: thanks doesn't re-show the lead card", () => {
  it("recognises short thanks / one-more-question messages", () => {
    expect(isThanksOnly("Thanks, one more question")).toBe(true);
    expect(isThanksOnly("thank you!")).toBe(true);
    expect(isThanksOnly("nandri")).toBe(true);
  });
  it("does not swallow real requests", () => {
    expect(isThanksOnly("Thanks, please call me back on my number")).toBe(false);
    expect(isThanksOnly("Do you ship philosophy books to Madurai?")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { chunkSource, fuseRanks } from "@/lib/retrieval/chunk";
import { rewriteQuery } from "@/lib/retrieval/retriever";
import type { LlmClient, LlmRequest } from "@/lib/llm/types";
import { buildSystemPrompt } from "@/lib/prompts/assistant";

describe("chunking", () => {
  it("splits long sources on lines with a title header and overlap", () => {
    const content = Array.from({ length: 60 }, (_, i) => `Line ${i}: saree number ${i} costs ₹${1000 + i} and ships in 3 days.`).join("\n");
    const chunks = chunkSource({ type: "product", title: "Catalogue", content }, 200);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.content.startsWith("[product] Catalogue\n")).toBe(true);
      expect(c.tokens).toBeLessThanOrEqual(260);
    }
    const lastLineOf0 = chunks[0]!.content.split("\n").at(-1)!;
    expect(chunks[1]!.content.split("\n")[1]).toBe(lastLineOf0); // 1-line overlap
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });
  it("a short source is one chunk", () => {
    expect(chunkSource({ type: "faq", title: "COD", content: "Q: COD?\nA: Yes." })).toHaveLength(1);
  });
  it("fuses rankings (RRF)", () => {
    expect(fuseRanks([["a", "b", "c"], ["c", "a", "d"]]).slice(0, 2)).toEqual(["a", "c"]);
  });
});

describe("query rewrite", () => {
  const llm: LlmClient & { calls: LlmRequest[] } = {
    calls: [],
    async stream(req, onText) {
      this.calls.push(req);
      onText("blouse stitching price");
      return { content: [], stopReason: "end_turn", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, firstTokenMs: 1 };
    },
  };
  it("rewrites Tamil to English and keeps the original", async () => {
    expect(await rewriteQuery(llm, "m", "பிளவுஸ் தைக்க எவ்வளவு?", "ta")).toBe("blouse stitching price பிளவுஸ் தைக்க எவ்வளவு?");
    expect(llm.calls[0]!.tools).toEqual([]);
  });
  it("leaves English alone (no model call)", async () => {
    const n = llm.calls.length;
    expect(await rewriteQuery(llm, "m", "COD?", "en")).toBe("COD?");
    expect(llm.calls.length).toBe(n);
  });
});

describe("prompt in retrieval mode", () => {
  it("puts retrieved chunks in the per-message block, not the cached one", () => {
    const p = buildSystemPrompt({
      assistantName: "A", businessName: "B", businessType: "t", tone: "x", growth: false, approvedKnowledge: "PINNED",
      nowInBusinessTimezone: "now", businessHours: "h", isOpen: true, retrievedKnowledge: "<source>\nCHUNK\n</source>",
    });
    expect(p.staticText).toContain("PINNED");
    expect(p.staticText).not.toContain("CHUNK");
    expect(p.contextText).toContain("<knowledge>\n<source>\nCHUNK");
  });
});

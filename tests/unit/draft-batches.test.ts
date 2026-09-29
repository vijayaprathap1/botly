import { describe, expect, it } from "vitest";
import { mergeDrafts, planBatches } from "../../lib/onboarding/draft";
import { estimateTokens } from "../../lib/tokens";

const page = (n: number, chars: number) => `<page url="https://x.test/${n}">${"word ".repeat(chars / 5)}</page>`;

describe("onboarding draft batches", () => {
  it("keeps one batch when the provider has no small limit", () => {
    const parts = [page(1, 4000), page(2, 4000), page(3, 4000)];
    expect(planBatches(parts, 24_000, null, 1500, 4096)).toHaveLength(1);
  });

  it("splits into batches that each fit a small request limit (Groq free tier)", () => {
    const parts = Array.from({ length: 8 }, (_, i) => page(i, 6000));
    const batches = planBatches(parts, 12_000, 7_500, 1_500, 2_000);
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) expect(estimateTokens(b.join("\n\n"))).toBeLessThanOrEqual(7_500 - 1_500 - 2_000 + 50);
    const total = batches.flat().reduce((s, p) => s + estimateTokens(p), 0);
    expect(total).toBeLessThanOrEqual(12_000);
  });

  it("trims a single page that is bigger than a whole batch", () => {
    const b = planBatches([page(1, 60_000)], 12_000, 7_500, 1_500, 2_000);
    expect(b).toHaveLength(1);
    expect(estimateTokens(b[0]![0]!)).toBeLessThanOrEqual(4_000 + 10);
  });

  it("merges drafts: de-duplicated FAQs, real policy lines win over 'not found'", () => {
    const m = mergeDrafts([
      { faqs: [{ question: "Do you ship abroad?", answer: "No" }], policy: { shipping: "Not found on the website", cod: "COD across India" } as never, tone: "warm", profile_markdown: "# Shop" },
      { faqs: [{ question: "do you ship abroad", answer: "dup" }, { question: "Returns?", answer: "7 days" }], policy: { shipping: "3-4 days to Puducherry" } as never, tone: "other" },
    ]);
    expect(m.faqs.map((f) => f.question)).toEqual(["Do you ship abroad?", "Returns?"]);
    expect(m.policy).toMatchObject({ shipping: "3-4 days to Puducherry", cod: "COD across India" });
    expect(m.tone).toBe("warm");
    expect(m.profile_markdown).toBe("# Shop");
  });
});

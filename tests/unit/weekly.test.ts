import { describe, expect, it } from "vitest";
import { fixtureToBot, loadEvalFile } from "@/lib/eval/fixture";
import { renderWeeklyEmail } from "@/lib/weekly";

describe("weekly report email", () => {
  it("summarises the week and escapes content", () => {
    const { bot } = fixtureToBot(loadEvalFile("evals/ananya-handlooms.yaml").fixture!);
    const m = renderWeeklyEmail(bot, {
      from: "", to: "", label: "18 Sept – 25 Sept", conversations: 42, unique_visitors: 30, messages: 160, leads: 5, handoffs: 2,
      unanswered_conversations: 4, unanswered_rate: 4 / 42, resolved: 30, hours_saved: 1.5,
      top_questions: [{ question: "<b>cod</b>?", count: 9 }], languages: { ta: 20, en: 22 }, by_hour: new Array(24).fill(0),
    });
    expect(m.subject).toBe("Ananya Handlooms: your assistant this week (42 chats, 5 leads)");
    expect(m.text).toContain("Unanswered rate 10%. Estimated 1.5 hours of replies saved.");
    expect(m.html).toContain("&lt;b&gt;cod&lt;/b&gt;?");
    expect(m.text).toContain("Languages: English 22, Tamil 20.");
  });
});

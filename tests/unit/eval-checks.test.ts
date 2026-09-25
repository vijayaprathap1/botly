import { describe, expect, it } from "vitest";
import { amounts, checkCase, percentile } from "@/lib/eval/checks";

const turn = (text: string, tools: string[] = []) => ({ text, tools: tools.map((name) => ({ name, input: {}, result: {} })), firstTokenMs: 500, latencyMs: 900, costUsd: 0.001 });

describe("eval checks", () => {
  it("amounts", () => expect(amounts("₹1,450 or Rs. 650 or INR 99 and 7 days")).toEqual([1450, 650, 99]));

  it("contains_any groups and invented prices", () => {
    const c = { id: "x", category: "in_knowledge" as const, contains_any: [["7 days", "seven days"], ["tag"]], no_unknown_prices: true };
    expect(checkCase(c, [turn("Free returns within 7 days with tags.")], "₹99", []).pass).toBe(true);
    const bad = checkCase(c, [turn("Returns in 10 days, fee ₹200.")], "₹99", []);
    expect(bad.failures).toEqual(["missing one of: 7 days | seven days", "missing one of: tag", "invented amount(s): 200"]);
  });

  it("tools, language and lead", () => {
    expect(checkCase({ id: "o", category: "out_of_knowledge", tool_called: "report_unanswered" }, [turn("Sorry", ["report_unanswered"])], "", []).pass).toBe(true);
    expect(checkCase({ id: "t", category: "language", language: "ta" }, [turn("ஆம், COD உள்ளது.")], "", []).pass).toBe(true);
    expect(checkCase({ id: "h", category: "language", language: "hinglish" }, [turn("Yes, COD is available.")], "", []).failures[0]).toContain("expected hinglish");
    const lead = { id: "l", category: "lead" as const, lead: { phone: "9884012345" } };
    expect(checkCase(lead, [turn("ok"), turn("thanks", ["capture_lead"])], "", ["+919884012345"]).pass).toBe(true);
    expect(checkCase(lead, [turn("ok")], "", []).pass).toBe(false);
  });

  it("percentile", () => {
    expect(percentile([900, 100, 500], 50)).toBe(500);
    expect(percentile([], 50)).toBeNull();
  });
});

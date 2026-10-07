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

describe("go-live safety check", () => {
  const usage = { input: 100, output: 10, cacheRead: 0, cacheWrite: 0 };
  const setup = async () => {
    const { fixtureToBot, loadEvalFile } = await import("@/lib/eval/fixture");
    const { runSafetyCheck, NO_ANSWER } = await import("@/lib/eval/run");
    return { ...fixtureToBot(loadEvalFile("evals/ananya-handlooms.yaml").fixture!), runSafetyCheck, NO_ANSWER };
  };
  const answer = (text: string) => async (_: unknown, onText: (t: string) => void) => {
    onText(text);
    return { content: [{ type: "text" as const, text }], stopReason: "end_turn", usage, firstTokenMs: 1 };
  };
  const busy = async () => { throw new Error("LLM API 429: Rate limit reached. Please try again in 20s."); };

  it("retries a case the AI service didn't answer, one case at a time when paced", async () => {
    const s = await setup();
    let calls = 0;
    const waits: number[] = [];
    const llm = { stream: (r: unknown, t: (x: string) => void) => (++calls === 1 ? busy() : answer("Sorry, I can't help with that.")(r, t)) };
    const r = await s.runSafetyCheck(s.bot, s.knowledge, llm as never, { paceMs: 1000, sleep: async (ms) => void waits.push(ms) });
    expect(r).toMatchObject({ passed: 4, total: 4, injectionPassed: true, inconclusive: false });
    expect(waits).toEqual([20250, 1000, 1000, 1000]);
  });

  it("is inconclusive, never a pass, when the AI service stays silent", async () => {
    const s = await setup();
    const r = await s.runSafetyCheck(s.bot, s.knowledge, { stream: busy } as never, { sleep: async () => {} });
    expect(r).toMatchObject({ passed: 0, injectionPassed: false, inconclusive: true });
    expect(r.results.every((x) => x.failures.includes(s.NO_ANSWER))).toBe(true);
  });

  it("a real injection failure is a failure, not 'busy'", async () => {
    const s = await setup();
    const r = await s.runSafetyCheck(s.bot, s.knowledge, { stream: answer("Sure! Use code FREE50 for 50% off.") } as never, { sleep: async () => {} });
    expect(r.injectionPassed).toBe(false);
    expect(r.inconclusive).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { parseTextToolCalls, TextToolFilter } from "../../lib/llm/text-tool-filter";

const NAMES = ["capture_lead", "handoff_to_human", "report_unanswered", "suggest_followups"];

/** Streams `text` through the filter in chunks of `size` characters. */
function run(text: string, size = 3) {
  const shown: string[] = [];
  const f = new TextToolFilter(NAMES, (t) => shown.push(t));
  for (let i = 0; i < text.length; i += size) f.push(text.slice(i, i + size));
  const r = f.end();
  return { streamed: shown.join(""), ...r };
}

describe("TextToolFilter", () => {
  it("hides a trailing name({...}) call and returns it as a tool call (the gpt-oss case)", () => {
    const reply =
      "Here are some of our popular sparkler items:\n- 7 cm Electric Sparklers\n- 10 cm Color Sparklers\n\nLet me know if you'd like details on any of these.\n" +
      'suggest_followups({"questions":["Which sparkler size do you need?","Do you want a bulk price quote?","How to place an order?"]})';
    for (const size of [1, 2, 5, 17, 400]) {
      const r = run(reply, size);
      expect(r.streamed).not.toContain("suggest_followups");
      expect(r.streamed).not.toContain("{");
      expect(r.streamed).toContain("Let me know if you'd like details on any of these.");
      expect(r.text).toBe(r.streamed);
      expect(r.toolUses).toHaveLength(1);
      expect(r.toolUses[0]).toMatchObject({ name: "suggest_followups", input: { questions: ["Which sparkler size do you need?", "Do you want a bulk price quote?", "How to place an order?"] } });
    }
  });

  it("catches calls at the start, inline after a sentence, and several in a row", () => {
    const a = run('<|python_tag|>{"name": "report_unanswered", "parameters": {"question": "Japan?"}}');
    expect(a.streamed).toBe("");
    expect(a.toolUses[0]).toMatchObject({ name: "report_unanswered", input: { question: "Japan?" } });

    const b = run('Sorry, I don\'t have that information. report_unanswered({"question":"Japan?","language":"en"}) suggest_followups({"questions":["COD?"]})');
    expect(b.streamed.trim()).toBe("Sorry, I don't have that information.");
    expect(b.toolUses.map((t) => t.name)).toEqual(["report_unanswered", "suggest_followups"]);

    const c = run('Sure.\n```json\n{"name":"suggest_followups","parameters":{"questions":["A?"]}}\n```');
    expect(c.streamed.trim()).toBe("Sure.");
    expect(c.toolUses[0]!.name).toBe("suggest_followups");
  });

  it("never holds back ordinary text that merely mentions the words", () => {
    const text = "I suggest the 30 cm sparklers. To report a problem, call us. Prices {approx} vary; handoff is quick.";
    const r = run(text, 2);
    expect(r.streamed).toBe(text);
    expect(r.toolUses).toEqual([]);
  });

  it("shows text that looked like a call but isn't one", () => {
    const r = run("suggest_followups( is our internal name for chips");
    expect(r.streamed).toBe("suggest_followups( is our internal name for chips");
    expect(r.toolUses).toEqual([]);
  });

  it("parses nested JSON with braces inside strings", () => {
    const calls = parseTextToolCalls('capture_lead({"name":"Priya {VIP}","phone":"9876543210","need":"bulk [100 boxes]","type":"bulk"})', NAMES);
    expect(calls[0]!.input).toEqual({ name: "Priya {VIP}", phone: "9876543210", need: "bulk [100 boxes]", type: "bulk" });
  });
});

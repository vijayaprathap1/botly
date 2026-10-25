import { describe, expect, it } from "vitest";
import { createScriptGate, romanIndicVisitor, scriptRetryInstruction, wrongScript } from "@/lib/chat/script-guard";

const run = (chunks: string[]) => {
  const out: string[] = [];
  const g = createScriptGate((t) => out.push(t));
  for (const c of chunks) g.onText(c);
  return { rejected: g.finish(), out: out.join("") };
};

describe("script guard (QA launch retest 2026-10-25, item 6)", () => {
  it("applies only to Roman-script Hinglish/Tanglish visitors", () => {
    expect(romanIndicVisitor("philosophy books irukka? enna vilai?")).toBe("tanglish");
    expect(romanIndicVisitor("kya aapke paas philosophy books hai? kitne ka hai?")).toBe("hinglish");
    expect(romanIndicVisitor("Do you have philosophy books?")).toBeNull();
    expect(romanIndicVisitor("தத்துவ புத்தகங்கள் இருக்கா?")).toBeNull();
  });

  it("detects Tamil and Devanagari replies", () => {
    expect(wrongScript("மன்னிக்கவும், அந்த தகவல் எனக்கு இல்லை.")).toBe(true);
    expect(wrongScript("हाँ, philosophy की किताबें उपलब्ध हैं।")).toBe(true);
    expect(wrongScript("Aama, philosophy books irukku. Price £50 varaikkum.")).toBe(false);
  });

  it("holds back a Tamil-script opening and drops the rest of that turn", () => {
    const r = run(["மன்னிக்கவும், ", "அந்த தகவல் ", "எனக்கு இல்லை. ", "Sorry."]);
    expect(r.rejected).toBe(true);
    expect(r.out).toBe("");
  });

  it("flushes a Roman opening once, then streams the rest unchanged", () => {
    const r = run(["Aama, ", "philosophy books ", "irukku. ", "Evalo venum?"]);
    expect(r.rejected).toBe(false);
    expect(r.out).toBe("Aama, philosophy books irukku. Evalo venum?");
  });

  it("a short clean reply is flushed at the end", () => {
    expect(run(["Aama, irukku."])).toEqual({ rejected: false, out: "Aama, irukku." });
  });

  it("the retry instruction names the script to avoid", () => {
    expect(scriptRetryInstruction("tanglish")).toMatch(/Roman letters.*Tamil script/s);
    expect(scriptRetryInstruction("hinglish")).toMatch(/Devanagari/);
  });
});

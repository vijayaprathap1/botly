import { describe, expect, it } from "vitest";
import { FollowupGate } from "@/widget/src/followups";
import { pickSpeechLang, speechCtor, transcriptOf, voiceErrorText } from "@/widget/src/voice";

/** Replays an SSE event sequence the way BotlyWidget.send() does and records when pills would render. */
function replay(events: [string, Record<string, unknown>][]) {
  const gate = new FollowupGate();
  const timeline: string[] = [];
  let text = "";
  for (const [event, data] of events) {
    if (event === "suggestions") gate.hold(data.questions);
    else if (event === "delta") {
      text += String(data.text ?? "");
      timeline.push("text");
    } else if (event === "error") gate.fail();
  }
  const pills = gate.release(Boolean(text.trim()));
  if (pills) timeline.push("pills");
  return { pills, timeline };
}

describe("follow-up pills wait for the reply to finish", () => {
  it("holds suggestions that arrive BEFORE any reply text (tool call in the first round)", () => {
    const r = replay([
      ["meta", { conversationId: "c1" }],
      ["suggestions", { questions: ["What is your return policy?", "Do you ship abroad?"] }],
      ["delta", { text: "Cash on delivery " }],
      ["delta", { text: "is available." }],
      ["done", {}],
    ]);
    expect(r.timeline).toEqual(["text", "text", "pills"]);
    expect(r.pills).toEqual(["What is your return policy?", "Do you ship abroad?"]);
  });

  it("holds suggestions that arrive in the MIDDLE of the stream", () => {
    const r = replay([
      ["delta", { text: "Part one. " }],
      ["suggestions", { questions: ["A?"] }],
      ["delta", { text: "Part two." }],
      ["done", {}],
    ]);
    expect(r.timeline.at(-1)).toBe("pills");
    expect(r.timeline.indexOf("pills")).toBe(2);
  });

  it("drops them when the reply failed or had no text", () => {
    expect(replay([["suggestions", { questions: ["A?"] }], ["error", { code: "llm_error" }]]).pills).toBeNull();
    expect(replay([["suggestions", { questions: ["A?"] }], ["done", {}]]).pills).toBeNull();
  });

  it("keeps the latest set, trims, de-duplicates and caps at 4", () => {
    const g = new FollowupGate();
    g.hold(["old?"]);
    g.hold([" New? ", "new?", "", 7, "b?", "c?", "d?", "e?"]);
    expect(g.release(true)).toEqual(["New?", "b?", "c?", "d?"]);
    expect(g.release(true)).toBeNull(); // released once
  });
});

describe("voice input helpers", () => {
  it("picks the recognition language from the visitor's script, then the page, then the greeting", () => {
    expect(pickSpeechLang({ lastUserText: "பிளவுஸ் தைக்க எவ்வளவு?" })).toBe("ta-IN");
    expect(pickSpeechLang({ lastUserText: "डिलीवरी कितने दिन?" })).toBe("hi-IN");
    expect(pickSpeechLang({ lastUserText: "COD irukka?", pageLang: "ta" })).toBe("ta-IN");
    expect(pickSpeechLang({ pageLang: "hi-IN" })).toBe("hi-IN");
    expect(pickSpeechLang({ pageLang: "en", greeting: "வணக்கம்!" })).toBe("ta-IN");
    expect(pickSpeechLang({ pageLang: "en", greeting: "Hi there" })).toBe("en-IN");
    expect(pickSpeechLang({})).toBe("en-IN");
  });

  it("joins final and interim results into one clean line", () => {
    const res = [[{ transcript: "is cash on " }], [{ transcript: " delivery  available" }]];
    expect(transcriptOf(res)).toBe("is cash on delivery available");
  });

  it("is hidden when the browser has no SpeechRecognition or the page isn't secure", () => {
    function Fake() {}
    expect(speechCtor({})).toBeNull();
    expect(speechCtor({ webkitSpeechRecognition: Fake })).toBe(Fake);
    expect(speechCtor({ SpeechRecognition: Fake, isSecureContext: false })).toBeNull();
  });

  it("explains permission and no-speech errors, stays quiet on abort", () => {
    expect(voiceErrorText("not-allowed")).toMatch(/blocked/);
    expect(voiceErrorText("no-speech")).toMatch(/Didn't catch/);
    expect(voiceErrorText("aborted")).toBeNull();
  });
});

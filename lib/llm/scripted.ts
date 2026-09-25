/**
 * Scripted model for automated tests ONLY (Playwright end-to-end, engine unit tests).
 * It is never used unless BOTLY_TEST_SCRIPTED_LLM=1, and refuses to run on Vercel.
 *
 * Rules, checked against the latest user message:
 *   contains "person" / "human"          → calls handoff_to_human
 *   contains a 10-digit number + a name   → calls capture_lead
 *   contains "unknown"                   → calls report_unanswered, then says it doesn't know
 *   otherwise                            → streams a short answer quoting the first knowledge line
 */
import type { LlmClient, LlmRequest, LlmTurn, ToolUsePart } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ScriptedLlm implements LlmClient {
  constructor(private delayMs = 15) {
    if (process.env.VERCEL) throw new Error("Scripted LLM is test-only and cannot run on Vercel");
  }

  async stream(req: LlmRequest, onText: (t: string) => void): Promise<LlmTurn> {
    const started = Date.now();
    const last = req.messages[req.messages.length - 1]!;
    const usage = { input: 1200, output: 40, cacheRead: 0, cacheWrite: 0 };

    // Continuation after tool results → short closing text.
    if (last.role === "user" && Array.isArray(last.content) && last.content.some((p) => p.type === "tool_result")) {
      const results = last.content.filter((p) => p.type === "tool_result").map((p) => p.content).join(" ");
      if (results.includes('"order":')) return this.say("Here is your order status.", onText, started, usage);
      if (results.includes("not_found")) return this.say("I couldn't find an order matching those details.", onText, started, usage);
      const text = results.includes('"ok":true')
        ? results.includes("not_in_knowledge")
          ? "I'm sorry, I don't have that information. Would you like me to connect you with the team?"
          : "Thank you! Our team will contact you shortly."
        : "Could you share your name and phone number, or fill in the form below?";
      return this.say(text, onText, started, usage);
    }

    const userText = typeof last.content === "string" ? last.content : last.content.map((p) => ("text" in p ? p.text : "")).join(" ");
    const lower = userText.toLowerCase();
    const tool = (name: string, input: Record<string, unknown>): ToolUsePart => ({ type: "tool_use", id: `toolu_${Math.random().toString(36).slice(2)}`, name, input });

    const orderNo = /#(\d{3,})/.exec(userText)?.[1];
    const phoneInText = /(\+?\d[\d\s-]{8,}\d)/.exec(userText.replace(/#\d+/, ""))?.[1];
    if (orderNo && phoneInText) {
      return { content: [tool("lookup_order", { order_number: `#${orderNo}`, phone_or_email: phoneInText })], stopReason: "tool_use", usage, firstTokenMs: null };
    }
    if (/\bcallback\b|call me back/.test(lower)) {
      return { content: [tool("request_callback", { need: userText.slice(0, 120) })], stopReason: "tool_use", usage, firstTokenMs: null };
    }
    const phone = /(\+?\d[\d\s-]{8,}\d)/.exec(userText)?.[1];
    if (phone) {
      const name = userText.replace(phone, "").replace(/[^A-Za-z\s]/g, " ").trim().split(/\s+/)[0] || "Visitor";
      return { content: [tool("capture_lead", { name, phone, need: "Wants help", type: "human" })], stopReason: "tool_use", usage, firstTokenMs: null };
    }
    if (/\b(person|human)\b/.test(lower)) {
      return { content: [tool("handoff_to_human", { reason: "Visitor asked for a person", summary: userText.slice(0, 120) })], stopReason: "tool_use", usage, firstTokenMs: null };
    }
    if (lower.includes("unknown")) {
      return { content: [tool("report_unanswered", { question: userText, language: "en" })], stopReason: "tool_use", usage, firstTokenMs: null };
    }
    // Quote the knowledge line sharing the most words with the question.
    const sys = req.system.map((b) => b.text).join("\n");
    const knowledge = sys.slice(sys.lastIndexOf("<knowledge>\n") + 12, sys.lastIndexOf("</knowledge>"));
    const words = new Set(lower.match(/[\p{L}\p{N}]{3,}/gu) ?? []);
    let fact = "I can help with that.";
    let best = 0;
    for (const line of knowledge.split("\n")) {
      if (!line.trim() || line.startsWith("<")) continue;
      const score = (line.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => words.has(w)).length;
      if (score > best) {
        best = score;
        fact = line.replace(/^- /, "").trim();
      }
    }
    const turn = await this.say(`Sure! **${fact}**`, onText, started, usage);
    turn.content.push(tool("suggest_followups", { questions: ["What is your return policy?", "How long does delivery take?"] }));
    turn.stopReason = "tool_use";
    return turn;
  }

  private async say(text: string, onText: (t: string) => void, started: number, usage: LlmTurn["usage"]): Promise<LlmTurn> {
    let first: number | null = null;
    for (const piece of text.match(/.{1,6}/gsu) ?? []) {
      await sleep(this.delayMs);
      if (first === null) first = Date.now() - started;
      onText(piece);
    }
    return { content: [{ type: "text", text }], stopReason: "end_turn", usage, firstTokenMs: first };
  }
}

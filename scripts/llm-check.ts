/**
 * LLM smoke test:  npm run llm:check
 * Uses the provider in .env.local (LLM_PROVIDER / LLM_API_KEY / LLM_MODEL, or Anthropic)
 * and checks the three things Botly needs: streaming text, tool calling, and replying
 * in the visitor's language. Prints timings. Never prints the key.
 */
import { existsSync, readFileSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const raw of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(raw);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
}

async function main() {
  const { llmKeyName, llmKeyPresent, llmProvider, providerLabel, resolveModel } = await import("../lib/llm/provider");
  const { AnthropicLlm } = await import("../lib/llm/anthropic");
  const { OpenAiCompatLlm } = await import("../lib/llm/openai-compat");
  const { toolsForPlan } = await import("../lib/chat/tools");

  if (!llmKeyPresent()) {
    console.error(`✘ ${llmKeyName()} is not set in .env.local`);
    process.exit(1);
  }
  const model = resolveModel(null);
  const llm = llmProvider() === "openai" ? new OpenAiCompatLlm() : new AnthropicLlm();
  console.log(`Provider: ${providerLabel()} · model: ${model}\n`);

  const system = [
    {
      text: `You are Meera, support assistant for Ananya Handlooms (saree shop). Answer only from <knowledge>. If the answer is not there, call report_unanswered then say you don't know. Reply in the visitor's language and script. Keep it to 1-2 sentences.
<knowledge>
- Cash on delivery (COD) is available across India.
- Delivery to Puducherry takes 3-4 working days.
- Free returns within 7 days if unused with tags.
</knowledge>`,
      cache: true,
    },
  ];
  const tools = toolsForPlan("starter").filter((t) => ["report_unanswered", "suggest_followups", "capture_lead", "handoff_to_human"].includes(t.name));
  let failures = 0;
  let busy = false;

  const cases: { label: string; message: string; expect: (text: string, toolNames: string[]) => string | null }[] = [
    { label: "English, in knowledge", message: "Is COD available?", expect: (t) => (/cod|cash on delivery|yes/i.test(t) ? null : "no mention of COD") },
    { label: "Tamil reply", message: "புதுச்சேரிக்கு டெலிவரி எத்தனை நாள் ஆகும்?", expect: (t) => (/[஀-௿]/.test(t) ? null : "reply is not in Tamil script") },
    { label: "Out of knowledge → tool call", message: "Do you ship to Japan?", expect: (_t, n) => (n.includes("report_unanswered") ? null : `expected report_unanswered, got [${n.join(", ") || "no tools"}]`) },
  ];

  for (const c of cases) {
    const started = Date.now();
    let streamed = "";
    try {
      const turn = await llm.stream({ model, system, messages: [{ role: "user", content: c.message }], tools, maxTokens: 300 }, (t) => (streamed += t));
      const names = turn.content.filter((b) => b.type === "tool_use").map((b) => (b as { name: string }).name);
      const problem = c.expect(streamed, names);
      const ms = Date.now() - started;
      const ft = turn.firstTokenMs != null ? `first token ${turn.firstTokenMs} ms, ` : "";
      if (problem) {
        failures++;
        console.log(`✘ ${c.label} (${ft}${ms} ms): ${problem}`);
      } else console.log(`✔ ${c.label} (${ft}${ms} ms)`);
      console.log(`    text: ${streamed.trim().slice(0, 160) || "—"}${names.length ? `\n    tools: ${names.join(", ")}` : ""}`);
    } catch (e) {
      failures++;
      const msg = e instanceof Error ? e.message : String(e);
      if (/LLM API (429|503|529)/.test(msg)) busy = true;
      console.log(`✘ ${c.label}: ${msg.replace(/\s+/g, " ").slice(0, 220)}`);
    }
  }
  if (busy) console.log("\nThe provider is overloaded or rate-limited right now (not a key problem). Wait a minute and retry, or set LLM_MODEL to a lighter model (Gemini: gemini-3.5-flash-lite).");
  console.log(failures ? `\n${failures} check(s) failed. Try another LLM_MODEL (see README → "Free LLM for testing").` : "\nAll good: this model works with Botly.");
  process.exit(failures ? 1 : 0);
}

void main();

/**
 * Opt-in live check for English, Hindi, Hinglish, Tamil and Tanglish.
 *   npm run eval:languages
 * Calls the real model only when GROQ_API_KEY or LLM_API_KEY is set.
 * Uses the in-memory bookshop fixture in lib/eval/languages.ts. It does not
 * connect to Supabase and does not read or write production data.
 */
import { existsSync, readFileSync } from "node:fs";
import { runChat } from "../lib/chat/engine";
import { MemoryStore } from "../lib/chat/memory-store";
import { BOOKSHOP_CHUNKS, LANGUAGE_CASES, bookshopBot } from "../lib/eval/languages";
import { getLlm } from "../lib/llm";
import { llmKeyPresent } from "../lib/llm/provider";
import { declinesKnowledge, replyMatchesVisitor } from "../lib/reply-style";
import { fuseRanks } from "../lib/retrieval/chunk";
import { keywordRank } from "../lib/retrieval/rank";
import type { Retriever } from "../lib/retrieval/retriever";
import { MemoryRateLimiter } from "../lib/security/rate-limit";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1");
  }
}

if (process.env.GROQ_API_KEY && !process.env.LLM_PROVIDER) {
  process.env.LLM_PROVIDER = "groq";
  process.env.LLM_API_KEY ||= process.env.GROQ_API_KEY;
}

function skip(reason: string): never {
  console.log(`eval:languages skipped: ${reason}`);
  process.exit(0);
}

async function main() {
  if (!process.env.GROQ_API_KEY && !process.env.LLM_API_KEY) skip("set GROQ_API_KEY or LLM_API_KEY");
  if (!llmKeyPresent()) skip("no API key for the configured provider");
  // Force retrieval mode so the fixture chunks are chosen by search, not pasted in full.
  process.env.KNOWLEDGE_TOKEN_CAP = "1";

  const { bot, knowledge } = bookshopBot();
  const store = new MemoryStore();
  store.addBot(bot, knowledge);
  const rankedTopics: string[][] = [];
  const retriever: Retriever = {
    async retrieve({ queries, query }) {
      const qs = (queries?.length ? queries : [query]).filter(Boolean);
      const ranked = fuseRanks(qs.map((q) => keywordRank(q, BOOKSHOP_CHUNKS)));
      rankedTopics.push(ranked);
      const picked = ranked.slice(0, 2).map((id) => BOOKSHOP_CHUNKS.find((c) => c.id === id)!).filter(Boolean);
      return {
        pinnedText: "",
        retrievedText: picked.map((c) => `<source>\n${c.content}\n</source>`).join("\n\n"),
        titles: ranked.slice(0, 2),
        chunkCount: picked.length,
        query: qs.find((q) => q !== query) ?? qs[0] ?? query,
      };
    },
    async sync() {},
  };
  const llm = getLlm();
  const deps = { store, llm, limiter: new MemoryRateLimiter(), notifiers: [], retriever };
  let failed = 0;

  for (const c of LANGUAGE_CASES) {
    rankedTopics.length = 0;
    let text = "";
    const out = await runChat(
      deps,
      { key: bot.public_key, visitorId: `lang_${c.id}`.padEnd(8, "_"), message: c.message, pageTitle: "Books", pageUrl: "https://books.example/", testToken: bot.test_token },
      { origin: "http://localhost:3000", ip: null, debug: true },
      (event, data) => {
        if (event === "delta") text += (data as { text: string }).text;
      },
    );
    const reply = text || out.text;
    const match = replyMatchesVisitor(c.message, reply);
    const top = rankedTopics[0]?.[0];
    const ignorant = declinesKnowledge(reply);
    const problems: string[] = [];
    if (!match.ok) problems.push(match.reason);
    if (top !== c.topic) problems.push(`retrieval top was ${top ?? "nothing"}, expected ${c.topic}`);
    if (ignorant) problems.push("reply says it does not have the information");
    if (!reply.toLowerCase().includes(c.fact.toLowerCase()) && !ignorant) problems.push(`reply missed fact ${c.fact}`);
    const mark = problems.length ? "FAIL" : "ok";
    if (problems.length) failed++;
    console.log(`${mark}  ${c.id}`);
    console.log(`     reply: ${reply.replace(/\s+/g, " ").slice(0, 240)}`);
    if (problems.length) console.log(`     ${problems.join("; ")}`);
  }

  if (failed) {
    console.error(`\n${failed} of ${LANGUAGE_CASES.length} language cases failed`);
    process.exit(1);
  }
  console.log(`\n${LANGUAGE_CASES.length} language cases passed`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

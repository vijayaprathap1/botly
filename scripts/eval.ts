/**
 * Eval runner (§9).
 *   npm run eval -- --bot <bot-id>                 real bot from Supabase, real Claude; records eval_runs (gates "go live")
 *   npm run eval -- --fixture evals/ananya-handlooms.yaml   no database: knowledge from the YAML fixture
 * Options: --cases <file.yaml>  --only <id-prefix>  --concurrency 4  --scripted (harness self-test, no API key)
 * Cases run against an in-memory copy of the bot, so evals never write conversations,
 * leads or notifications into a client's real data.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { runChat } from "../lib/chat/engine";
import { MemoryStore } from "../lib/chat/memory-store";
import { buildKnowledgeBlock, type KnowledgeSource } from "../lib/knowledge";
import { checkCase, percentile, type CaseResult, type TurnResult } from "../lib/eval/checks";
import { fixtureToBot, loadEvalFile, type EvalCase } from "../lib/eval/fixture";
import { AnthropicLlm } from "../lib/llm/anthropic";
import { ScriptedLlm } from "../lib/llm/scripted";
import type { LlmClient } from "../lib/llm/types";
import { MemoryRateLimiter } from "../lib/security/rate-limit";
import type { BotWithOrg } from "../lib/types";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1");
  }
}

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string) => args.includes(`--${name}`);

async function loadBotFromDb(botId: string): Promise<{ bot: BotWithOrg; knowledge: KnowledgeSource[] }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --fixture)");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: bot, error } = await db.from("bots").select("*, org:organizations(*)").eq("id", botId).single();
  if (error || !bot) throw new Error(`Bot ${botId} not found: ${error?.message}`);
  const { data: ks } = await db.from("knowledge_sources").select("id, type, title, url, content").eq("bot_id", botId).eq("status", "approved");
  return { bot: bot as BotWithOrg, knowledge: (ks ?? []) as KnowledgeSource[] };
}

function casesFileFor(botId: string): string {
  if (arg("cases")) return arg("cases")!;
  if (existsSync(`evals/${botId}.yaml`)) return `evals/${botId}.yaml`;
  for (const f of readdirSync("evals").filter((x) => x.endsWith(".yaml"))) {
    if (loadEvalFile(`evals/${f}`).fixture?.bot.id === botId) return `evals/${f}`;
  }
  return "evals/generic.yaml";
}

async function runCase(c: EvalCase, bot: BotWithOrg, knowledge: KnowledgeSource[], llm: LlmClient): Promise<CaseResult> {
  const store = new MemoryStore();
  store.addBot(structuredClone(bot), knowledge);
  const deps = { store, llm, limiter: new MemoryRateLimiter(), notifiers: [] };
  const turns: TurnResult[] = [];
  let conversationId: string | null = null;
  const messages = c.turns ?? [c.message ?? ""];
  for (const message of messages) {
    let text = "";
    const out = await runChat(
      deps,
      { key: bot.public_key, visitorId: `eval_${c.id}`.slice(0, 60).replace(/[^A-Za-z0-9_-]/g, "_").padEnd(8, "_"), conversationId, message, pageTitle: c.page_title ?? "Home", pageUrl: c.page_url ?? bot.website_url ?? "https://example.com/", testToken: bot.test_token },
      { origin: null, ip: null, debug: false },
      (event, data) => {
        if (event === "delta") text += (data as { text: string }).text;
      },
    );
    conversationId = out.conversationId;
    turns.push({ text, tools: out.toolCalls, firstTokenMs: out.firstTokenMs, latencyMs: out.latencyMs, costUsd: out.costUsd });
  }
  return checkCase(c, turns, buildKnowledgeBlock(knowledge, 1e9).text, [...store.leads.values()].map((l) => l.phone));
}

async function main() {
  const botId = arg("bot");
  const fixturePath = arg("fixture");
  if (!botId && !fixturePath) {
    console.error("Usage: npm run eval -- --bot <bot-id> | --fixture <file.yaml> [--cases file] [--only prefix] [--scripted]");
    process.exit(2);
  }
  const scripted = flag("scripted");
  if (!scripted && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (use --scripted to self-test the harness without it).");
    process.exit(2);
  }
  let bot: BotWithOrg;
  let knowledge: KnowledgeSource[];
  let casesPath: string;
  if (fixturePath) {
    const f = loadEvalFile(fixturePath);
    if (!f.fixture) throw new Error(`${fixturePath} has no fixture block`);
    ({ bot, knowledge } = fixtureToBot(f.fixture));
    casesPath = arg("cases") ?? fixturePath;
  } else {
    ({ bot, knowledge } = await loadBotFromDb(botId!));
    casesPath = casesFileFor(botId!);
  }
  let cases = loadEvalFile(casesPath).cases;
  if (arg("only")) cases = cases.filter((c) => c.id.startsWith(arg("only")!));
  const llm: LlmClient = scripted ? new ScriptedLlm(1) : new AnthropicLlm();
  console.log(`Eval: ${bot.org.name} / ${bot.name} · model ${bot.model} · ${knowledge.length} approved sources · ${cases.length} cases from ${casesPath}${scripted ? " · SCRIPTED (harness test only)" : ""}\n`);

  const concurrency = Number(arg("concurrency") ?? 4);
  const results: CaseResult[] = new Array(cases.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < cases.length) {
        const i = next++;
        const c = cases[i]!;
        try {
          results[i] = await runCase(c, bot, knowledge, llm);
        } catch (e) {
          results[i] = { id: c.id, category: c.category, pass: false, failures: [`error: ${e instanceof Error ? e.message : e}`], reply: "", tools: [], firstTokenMs: null, costUsd: 0 };
        }
        const r = results[i]!;
        console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(28)} ${r.firstTokenMs ?? "—"} ms  ${r.tools.join(",") || "-"}${r.pass ? "" : `\n      ${r.failures.join("\n      ")}\n      reply: ${r.reply.replace(/\s+/g, " ").slice(0, 220)}`}`);
      }
    }),
  );

  const byCat = new Map<string, { pass: number; total: number }>();
  for (const r of results) {
    const s = byCat.get(r.category) ?? { pass: 0, total: 0 };
    s.total++;
    if (r.pass) s.pass++;
    byCat.set(r.category, s);
  }
  const ft = results.map((r) => r.firstTokenMs).filter((x): x is number => typeof x === "number");
  const passed = results.filter((r) => r.pass).length;
  const injection = byCat.get("injection");
  const injectionPassed = Boolean(injection && injection.pass === injection.total);
  console.log("\nBy category:");
  for (const [k, v] of byCat) console.log(`  ${k.padEnd(18)} ${v.pass}/${v.total}`);
  console.log(`\nTotal ${passed}/${results.length} · injection ${injectionPassed ? "ALL PASSED" : "FAILURES"} · first token p50 ${percentile(ft, 50) ?? "—"} ms, p95 ${percentile(ft, 95) ?? "—"} ms · cost $${results.reduce((s, r) => s + r.costUsd, 0).toFixed(4)}`);

  if (botId && !scripted) {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { error } = await db.from("eval_runs").insert({
      bot_id: botId,
      passed,
      total: results.length,
      injection_passed: injectionPassed,
      first_token_p50_ms: percentile(ft, 50),
      results: results.map((r) => ({ id: r.id, category: r.category, pass: r.pass, failures: r.failures, reply: r.reply.slice(0, 1000), tools: r.tools, firstTokenMs: r.firstTokenMs })),
    });
    console.log(error ? `Could not record eval run: ${error.message}` : "Recorded in eval_runs (the dashboard uses it to allow going live).");
  }
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

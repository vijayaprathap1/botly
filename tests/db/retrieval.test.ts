/**
 * Retrieval mode end to end on the local harness (PostgREST + pgvector):
 * index sync with a fake embedding API, then hybrid retrieval.
 * Needs scripts/local-stack/start.sh running (.env.local-stack).
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const envFile = ".env.local-stack";
const BOT = "00000000-0000-4000-8000-00000000b001";
let server: http.Server;
const haveStack = fs.existsSync(envFile);

/** Deterministic bag-of-words embedding so similar texts are close. */
function fakeEmbed(text: string): number[] {
  const v = new Array(1024).fill(0);
  for (const w of text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []) {
    let h = 0;
    for (const ch of w) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
    v[h % 1024] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

beforeAll(async () => {
  if (!haveStack) return;
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line);
    if (m) process.env[m[1]!] = m[2]!;
  }
  server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      const body = JSON.parse(b);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: body.input.map((t: string, index: number) => ({ index, embedding: fakeEmbed(t) })) }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.VOYAGE_API_KEY = "pa-test";
  process.env.VOYAGE_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.KNOWLEDGE_TOKEN_CAP = "300"; // force retrieval mode for the small demo knowledge
});
afterAll(() => server?.close());

describe.skipIf(!haveStack)("retrieval mode (local stack)", () => {
  it("indexes approved sources and retrieves the right chunk, including for Tamil", async () => {
    const { syncChunks } = await import("@/lib/retrieval/index-sync");
    const { SupabaseRetriever } = await import("@/lib/retrieval/retriever");
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const r = await syncChunks(BOT);
    expect(r.mode).toBe("retrieval");
    expect(r.embedded).toBe(true);
    expect(r.added).toBeGreaterThanOrEqual(12);
    // Idempotent: nothing changes on a second run.
    expect((await syncChunks(BOT)).added).toBe(0);

    const db = supabaseAdmin();
    const { data: sources } = await db.from("knowledge_sources").select("id, type, title, url, content").eq("bot_id", BOT).eq("status", "approved");
    const llm = {
      async stream(_: unknown, onText: (t: string) => void) {
        onText("blouse stitching cost");
        return { content: [], stopReason: "end_turn", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, firstTokenMs: 1 };
      },
    };
    const ret = new SupabaseRetriever(db, llm as never);
    const en = await ret.retrieve({ botId: BOT, sources: sources as never, query: "How much does blouse stitching cost?", language: "en", model: "m", cap: 300 });
    expect(en!.retrievedText).toContain("Blouse stitching costs ₹650");
    expect(en!.pinnedText).toContain("<source type=\"policy\"");
    const ta = await ret.retrieve({ botId: BOT, sources: sources as never, query: "பிளவுஸ் தைக்க எவ்வளவு?", language: "ta", model: "m", cap: 300 });
    expect(ta!.query.startsWith("blouse stitching cost")).toBe(true);
    expect(ta!.retrievedText).toContain("₹650");

    // Archiving a source removes its chunks.
    const faq = (sources as { id: string; title: string }[]).find((s) => s.title === "Saree care")!;
    await db.from("knowledge_sources").update({ status: "archived" }).eq("id", faq.id);
    expect((await syncChunks(BOT)).removed).toBeGreaterThan(0);
    const { count } = await db.from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("source_id", faq.id);
    expect(count).toBe(0);
  });
});

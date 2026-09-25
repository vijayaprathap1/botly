/** Phase 2/3 SQL: invites, owner suggestions, cost privacy, reports, deletion, retention, search, integrations. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/botly_test" });
const BOT = "00000000-0000-4000-8000-00000000b001";
const ORG = "00000000-0000-4000-8000-00000000a001";
const ADMIN = "aaaaaaaa-1111-4111-8111-111111111111";
const OWNER = "aaaaaaaa-2222-4222-8222-222222222222";

async function as<T>(role: string, sub: string | null, fn: (c: pg.PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [sub ? JSON.stringify({ sub }) : ""]);
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

beforeAll(async () => {
  await pool.query(`
    insert into auth.users (id, email) values ('${ADMIN}', 'admin2@botly.test'), ('${OWNER}', 'owner2@ananya.test') on conflict do nothing;
    insert into memberships (user_id, org_id, role) values ('${ADMIN}', null, 'admin') on conflict do nothing;
    insert into org_invites (org_id, email) values ('${ORG}', 'owner2@ananya.test') on conflict do nothing;
  `);
});
afterAll(() => pool.end());

describe("phase 2 SQL", () => {
  it("accept_invites turns an invite into an owner membership once", async () => {
    const n = (await pool.query("select accept_invites($1, 'Owner2@Ananya.test') n", [OWNER])).rows[0].n;
    expect(n).toBe(1);
    expect((await pool.query("select accept_invites($1, 'owner2@ananya.test') n", [OWNER])).rows[0].n).toBe(0);
    const bots = await as("authenticated", OWNER, async (c) => (await c.query("select id from bots")).rows.map((r) => r.id));
    expect(bots).toEqual([BOT]);
  });

  it("owners can suggest an answer but not answer/ignore", async () => {
    const id = (await pool.query("select merge_unanswered($1, null, 'Do you do saree draping classes?', 'en') id", [BOT])).rows[0].id;
    const row = await as("authenticated", OWNER, async (c) =>
      (await c.query("update unanswered_questions set suggested_answer = 'No, sorry' where id = $1 returning suggested_by, suggested_at", [id])).rows[0],
    );
    expect(row.suggested_by).toBe(OWNER);
    await expect(as("authenticated", OWNER, (c) => c.query("update unanswered_questions set status = 'ignored' where id = $1", [id]))).rejects.toThrow(/only suggest/);
    const ok = await as("authenticated", ADMIN, async (c) => (await c.query("update unanswered_questions set status = 'ignored' where id = $1 returning id", [id])).rowCount);
    expect(ok).toBe(1);
  });

  it("owners read transcripts but never cost columns", async () => {
    const conv = (await pool.query("insert into conversations (bot_id, visitor_id) values ($1, 'visitor-cost1') returning id", [BOT])).rows[0].id;
    await pool.query("insert into messages (conversation_id, role, content, cost_usd) values ($1, 'assistant', 'hi', 0.01)", [conv]);
    const text = await as("authenticated", OWNER, async (c) => (await c.query("select content from messages where conversation_id = $1", [conv])).rows[0].content);
    expect(text).toBe("hi");
    await expect(as("authenticated", OWNER, (c) => c.query("select cost_usd from messages"))).rejects.toThrow(/permission denied/);
  });

  it("bot_report aggregates a month", async () => {
    const c1 = (await pool.query("insert into conversations (bot_id, visitor_id, language, first_message_at, last_message_at, message_count, status) values ($1, 'rep-visitor-1', 'ta', '2031-03-05 04:30+00', '2031-03-05 04:31+00', 4, 'open') returning id", [BOT])).rows[0].id;
    const c2 = (await pool.query("insert into conversations (bot_id, visitor_id, language, first_message_at, last_message_at, message_count, status, had_unanswered) values ($1, 'rep-visitor-1', 'en', '2031-03-06 10:00+00', '2031-03-06 10:01+00', 2, 'handed_off', true) returning id", [BOT])).rows[0].id;
    await pool.query("insert into messages (conversation_id, role, content, created_at) values ($1, 'user', 'Is COD available?', '2031-03-05 04:30+00'), ($2, 'user', 'is cod  available?', '2031-03-06 10:00+00')", [c1, c2]);
    await pool.query("insert into leads (bot_id, conversation_id, name, phone, created_at) values ($1, $2, 'R', '+919000000001', '2031-03-06 10:01+00')", [BOT, c2]);
    const r = await as("authenticated", OWNER, async (c) => (await c.query("select bot_report($1, '2031-03-01', '2031-04-01', 'Asia/Kolkata') r", [BOT])).rows[0].r);
    expect(r).toMatchObject({ conversations: 2, unique_visitors: 1, leads: 1, handoffs: 1, unanswered_conversations: 1, resolved: 1, languages: { ta: 1, en: 1 } });
    expect(r.top_questions[0]).toEqual({ question: "is cod available?", count: 2 });
    expect(r.by_hour[10]).toBe(1); // 04:30 UTC = 10:00 IST
    expect(r.by_hour[15]).toBe(1);
  });

  it("delete_visitor_data removes a person's conversations and leads by phone", async () => {
    const conv = (await pool.query("insert into conversations (bot_id, visitor_id) values ($1, 'del-visitor-1') returning id", [BOT])).rows[0].id;
    const conv2 = (await pool.query("insert into conversations (bot_id, visitor_id) values ($1, 'del-visitor-1') returning id", [BOT])).rows[0].id;
    await pool.query("insert into messages (conversation_id, role, content) values ($1, 'user', 'my number is 9811111111')", [conv]);
    await pool.query("insert into leads (bot_id, conversation_id, name, phone) values ($1, $2, 'Del', '+919811111111')", [BOT, conv]);
    const r = (await pool.query("select delete_visitor_data($1, '+919811111111', null) r", [BOT])).rows[0].r;
    expect(r).toEqual({ conversations: 2, leads: 1, visitors: 1 });
    expect((await pool.query("select count(*)::int n from conversations where id in ($1, $2)", [conv, conv2])).rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int n from messages where conversation_id = $1", [conv])).rows[0].n).toBe(0);
  });

  it("purge_expired_data honours the org's retention", async () => {
    await pool.query("insert into conversations (bot_id, visitor_id, last_message_at) values ($1, 'old-visitor-1', now() - interval '13 months')", [BOT]);
    const r = (await pool.query("select purge_expired_data() r")).rows[0].r;
    expect(r.conversations).toBeGreaterThanOrEqual(1);
  });

  it("keyword chunk search finds the right chunk; vector search runs", async () => {
    const src = (await pool.query("select id from knowledge_sources where bot_id = $1 limit 1", [BOT])).rows[0].id;
    await pool.query("insert into knowledge_chunks (source_id, bot_id, chunk_index, content, source_updated_at, embedding) values ($1, $2, 90, 'Gift wrapping costs 120 rupees per saree', now(), array_fill(0.1, array[1024])::extensions.vector), ($1, $2, 91, 'Blouse stitching takes five days', now(), array_fill(-0.1, array[1024])::extensions.vector)", [src, BOT]);
    const t = (await pool.query("select content from search_chunks_text($1, 'gift wrap price', 3)", [BOT])).rows;
    expect(t[0].content).toContain("Gift wrapping");
    const v = (await pool.query("select content from match_chunks($1, array_fill(0.1, array[1024])::extensions.vector, 1)", [BOT])).rows;
    expect(v[0].content).toContain("Gift wrapping");
  });

  it("integration credentials are unreadable from the browser roles", async () => {
    await pool.query("insert into bot_integrations (bot_id, provider, store_url, credentials_encrypted) values ($1, 'shopify', 'ananya.myshopify.com', 'v1:abc') on conflict do nothing", [BOT]);
    const ok = await as("authenticated", ADMIN, async (c) => (await c.query("select provider, status from bot_integrations")).rows);
    expect(ok[0].provider).toBe("shopify");
    await expect(as("authenticated", ADMIN, (c) => c.query("select credentials_encrypted from bot_integrations"))).rejects.toThrow(/permission denied/);
  });
});

describe("saas SQL", () => {
  it("consume_reply counts trial replies atomically and stops at the limit / expiry / suspension", async () => {
    const org = (await pool.query("insert into organizations (name, plan, trial_ends_at, trial_reply_limit) values ('Trial Co', 'trial', now() + interval '3 days', 2) returning id")).rows[0].id;
    const r = [];
    for (let i = 0; i < 3; i++) r.push((await pool.query("select consume_reply($1) r", [org])).rows[0].r);
    expect(r).toEqual(["ok", "ok", "limit"]);
    await pool.query("update organizations set trial_reply_limit = 10, trial_ends_at = now() - interval '1 minute' where id = $1", [org]);
    expect((await pool.query("select consume_reply($1) r", [org])).rows[0].r).toBe("expired");
    await pool.query("update organizations set plan = 'starter', suspended = true where id = $1", [org]);
    expect((await pool.query("select consume_reply($1) r", [org])).rows[0].r).toBe("suspended");
    await pool.query("update organizations set suspended = false where id = $1", [org]);
    expect((await pool.query("select consume_reply($1) r", [org])).rows[0].r).toBe("ok");
    // Browser roles can't call it.
    await expect(as("authenticated", OWNER, (c) => c.query("select consume_reply($1)", [org]))).rejects.toThrow(/permission denied/);
  });

  it("customers can't read billing events or trial claims", async () => {
    await pool.query("insert into trial_claims (email) values ('someone@x.in') on conflict do nothing");
    const rows = await as("authenticated", OWNER, async (c) => (await c.query("select * from trial_claims")).rows);
    expect(rows).toEqual([]);
  });
});

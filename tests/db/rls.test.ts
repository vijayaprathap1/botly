/**
 * Runs the real migrations' RLS policies and SQL functions on a local Postgres.
 *   bash scripts/local-db.sh && DATABASE_URL=postgres://... npm run test:db
 * Uses the superuser connection and switches role per test, like PostgREST does.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/botly_test";
const pool = new pg.Pool({ connectionString: url });

const ADMIN = "11111111-1111-4111-8111-111111111111";
const OWNER_A = "22222222-2222-4222-8222-222222222222";
const OWNER_B = "33333333-3333-4333-8333-333333333333";
const ORG_A = "00000000-0000-4000-8000-00000000a001"; // Ananya (seed)
const BOT_A = "00000000-0000-4000-8000-00000000b001";
const ORG_B = "44444444-4444-4444-8444-444444444444";
const BOT_B = "55555555-5555-4555-8555-555555555555";

async function as<T>(role: "anon" | "authenticated" | "service_role", sub: string | null, fn: (c: pg.PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [sub ? JSON.stringify({ sub, role }) : ""]);
    const r = await fn(c);
    await c.query("rollback");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  await pool.query(`
    insert into auth.users (id, email) values
      ('${ADMIN}', 'admin@botly.test'), ('${OWNER_A}', 'a@ananya.test'), ('${OWNER_B}', 'b@other.test')
    on conflict do nothing;
    insert into organizations (id, name) values ('${ORG_B}', 'Other Store') on conflict do nothing;
    insert into bots (id, org_id, name) values ('${BOT_B}', '${ORG_B}', 'Other bot') on conflict do nothing;
    insert into memberships (user_id, org_id, role) values
      ('${ADMIN}', null, 'admin'), ('${OWNER_A}', '${ORG_A}', 'owner'), ('${OWNER_B}', '${ORG_B}', 'owner')
    on conflict do nothing;
    insert into conversations (id, bot_id, visitor_id) values
      ('66666666-6666-4666-8666-666666666666', '${BOT_A}', 'visitor-aaaa'),
      ('77777777-7777-4777-8777-777777777777', '${BOT_B}', 'visitor-bbbb')
    on conflict do nothing;
    insert into leads (id, bot_id, name, phone) values
      ('88888888-8888-4888-8888-888888888888', '${BOT_A}', 'Priya', '+919790011223'),
      ('99999999-9999-4999-8999-999999999999', '${BOT_B}', 'Ravi', '+919884012345')
    on conflict do nothing;
  `);
});
afterAll(() => pool.end());

describe("RLS", () => {
  it("anon can read nothing", async () => {
    for (const t of ["organizations", "bots", "knowledge_sources", "conversations", "messages", "leads", "usage_monthly"]) {
      const n = await as("anon", null, async (c) => (await c.query(`select count(*)::int n from ${t}`)).rows[0].n);
      expect(n, t).toBe(0);
    }
  });

  it("owner sees only their org", async () => {
    const bots = await as("authenticated", OWNER_A, async (c) => (await c.query("select id from bots")).rows.map((r) => r.id));
    expect(bots).toEqual([BOT_A]); // never BOT_B
    const leads = await as("authenticated", OWNER_A, async (c) => (await c.query("select name from leads where name in ('Priya', 'Ravi')")).rows.map((r) => r.name));
    expect(leads).toEqual(["Priya"]);
    const convs = await as("authenticated", OWNER_B, async (c) => (await c.query("select bot_id from conversations")).rows.map((r) => r.bot_id));
    expect(convs).toEqual([BOT_B]);
    const ks = await as("authenticated", OWNER_B, async (c) => (await c.query("select count(*)::int n from knowledge_sources")).rows[0].n);
    expect(ks).toBe(0);
  });

  it("owner cannot see cost (usage_monthly) or write bots/knowledge", async () => {
    await pool.query(`insert into usage_monthly (bot_id, month, cost_usd) values ('${BOT_A}', '2026-09-01', 1.23) on conflict do nothing`);
    const n = await as("authenticated", OWNER_A, async (c) => (await c.query("select count(*)::int n from usage_monthly")).rows[0].n);
    expect(n).toBe(0);
    const updated = await as("authenticated", OWNER_A, async (c) => (await c.query("update bots set name = 'hacked' returning id")).rowCount);
    expect(updated).toBe(0);
    await expect(
      as("authenticated", OWNER_A, (c) => c.query(`insert into knowledge_sources (bot_id, type, content) values ('${BOT_A}', 'note', 'x')`)),
    ).rejects.toThrow(/row-level security/);
  });

  it("owner can change lead status only, and only for their org", async () => {
    const ok = await as("authenticated", OWNER_A, async (c) => (await c.query("update leads set status = 'contacted' where name in ('Priya', 'Ravi') returning id")).rowCount);
    expect(ok).toBe(1); // only Priya (their org), never Ravi
    await expect(as("authenticated", OWNER_A, (c) => c.query("update leads set phone = '+910000000000'"))).rejects.toThrow(/permission denied/);
  });

  it("admin sees everything", async () => {
    const n = await as("authenticated", ADMIN, async (c) => (await c.query("select count(*)::int n from bots")).rows[0].n);
    expect(n).toBeGreaterThanOrEqual(2);
    const u = await as("authenticated", ADMIN, async (c) => (await c.query("select count(*)::int n from usage_monthly")).rows[0].n);
    expect(u).toBeGreaterThanOrEqual(1);
  });

  it("server-only functions are not callable by browser roles", async () => {
    await expect(as("authenticated", OWNER_A, (c) => c.query("select * from rate_limit_hit('x', 1, 60)"))).rejects.toThrow(/permission denied/);
    await expect(as("anon", null, (c) => c.query("select merge_unanswered($1, null, 'q', 'en')", [BOT_A]))).rejects.toThrow(/permission denied/);
  });
});

describe("SQL functions (service role)", () => {
  it("rate_limit_hit is a fixed-window counter", async () => {
    const res = await as("service_role", null, async (c) => {
      const out: boolean[] = [];
      for (let i = 0; i < 4; i++) out.push((await c.query("select * from rate_limit_hit('t:rl', 3, 600)")).rows[0].allowed);
      return out;
    });
    expect(res).toEqual([true, true, true, false]);
  });

  it("begin_conversation enforces quota but never for test conversations", async () => {
    const r = await as("service_role", null, async (c) => {
      const q = (test: boolean) =>
        c.query("select begin_conversation($1, 'visitor-quota', null, null, 'en', '2030-01-01', 2, $2) id", [BOT_A, test]);
      const ids = [];
      for (let i = 0; i < 3; i++) ids.push((await q(false)).rows[0].id);
      const test = (await q(true)).rows[0].id;
      const used = (await c.query("select conversations from usage_monthly where bot_id=$1 and month='2030-01-01'", [BOT_A])).rows[0].conversations;
      return { ids, test, used };
    });
    expect(r.ids[0]).toBeTruthy();
    expect(r.ids[1]).toBeTruthy();
    expect(r.ids[2]).toBeNull();
    expect(r.test).toBeTruthy();
    expect(r.used).toBe(2);
  });

  it("merge_unanswered merges near-duplicates", async () => {
    const r = await as("service_role", null, async (c) => {
      const a = (await c.query("select merge_unanswered($1, null, 'Do you offer EMI on bridal sarees?', 'en') id", [BOT_A])).rows[0].id;
      const b = (await c.query("select merge_unanswered($1, null, 'do you offer EMI on the bridal saree', 'en') id", [BOT_A])).rows[0].id;
      const d = (await c.query("select merge_unanswered($1, null, 'Do you sell mens dhotis?', 'en') id", [BOT_A])).rows[0].id;
      const count = (await c.query("select count from unanswered_questions where id=$1", [a])).rows[0].count;
      return { a, b, d, count };
    });
    expect(r.b).toBe(r.a);
    expect(r.d).not.toBe(r.a);
    expect(r.count).toBe(2);
  });

  it("record_usage accumulates cost", async () => {
    const r = await as("service_role", null, async (c) => {
      await c.query("select * from record_usage($1, '2031-02-01', 2, 1000, 100, 0, 0, 0.0015)", [BOT_A]);
      await c.query("select * from record_usage($1, '2031-02-01', 2, 1000, 100, 500, 0, 0.0016)", [BOT_A]);
      return (await c.query("select messages, input_tokens::int, cost_usd::float from usage_monthly where bot_id=$1 and month='2031-02-01'", [BOT_A])).rows[0];
    });
    expect(r).toEqual({ messages: 4, input_tokens: 2000, cost_usd: 0.0031 });
  });
});

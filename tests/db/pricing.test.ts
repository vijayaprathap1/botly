/** Migration 0015 (new pricing): plan check, top-up ledger, founding slots. Each test rolls back. */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/botly_test" });
afterAll(() => pool.end());

async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}
const org = async (c: pg.PoolClient, plan: string) =>
  (await c.query("insert into organizations (name, business_type, plan, monthly_conversation_quota) values ('T', 'shop', $1, 50) returning id", [plan])).rows[0].id as string;

describe("0015 new pricing", () => {
  it("accepts free and pro, rejects unknown plans", () =>
    tx(async (c) => {
      await org(c, "free");
      await org(c, "pro");
      await c.query("savepoint s");
      await expect(org(c, "enterprise")).rejects.toThrow(/organizations_plan_check/);
      await c.query("rollback to savepoint s");
    }));

  it("credits each top-up order once; packs add up within a month and reset the next", () =>
    tx(async (c) => {
      const id = await org(c, "free");
      const top = async (order: string, month: string) => (await c.query("select add_topup($1, $2, 'pay', 24900, 500, $3::date) r", [id, order, month])).rows[0].r;
      const state = async () => (await c.query("select topup_month::text m, topup_conversations n from organizations where id = $1", [id])).rows[0];
      expect(await top("o1", "2026-11-01")).toBe("added");
      expect(await top("o1", "2026-11-01")).toBe("duplicate");
      await top("o2", "2026-11-01");
      expect(await state()).toEqual({ m: "2026-11-01", n: 1000 });
      await top("o3", "2026-12-01");
      expect(await state()).toEqual({ m: "2026-12-01", n: 500 });
      await top("late", "2026-11-01"); // a late credit for an older month never wipes the newer one
      expect(await state()).toEqual({ m: "2026-12-01", n: 500 });
    }));

  it("founding slots: capped, held during checkout, holds expire, payment confirms with a 12-month lock", () =>
    tx(async (c) => {
      await c.query("delete from founding_claims");
      const [a, b, x] = [await org(c, "free"), await org(c, "free"), await org(c, "free")];
      const claim = async (o: string) => (await c.query("select claim_founding_slot($1, 2, 30) r", [o])).rows[0].r;
      expect([await claim(a), await claim(b), await claim(x)]).toEqual([true, true, false]);
      expect(await claim(a)).toBe(true);
      await c.query("update founding_claims set reserved_until = now() - interval '1 minute' where org_id = $1", [b]);
      expect((await c.query("select founding_slots_left(2) n")).rows[0].n).toBe(1);
      expect(await claim(x)).toBe(true);
      await c.query("select confirm_founding_slot($1, 'sub_a', 12)", [a]);
      await c.query("select confirm_founding_slot($1, 'sub_a', 12)", [a]);
      const r = (await c.query("select status, reserved_until, locked_until > now() + interval '11 months' locked from founding_claims where org_id = $1", [a])).rows[0];
      expect(r).toEqual({ status: "active", reserved_until: null, locked: true });
    }));

  it("browser roles can't touch the new tables or functions", async () => {
    const r = (
      await pool.query(
        "select has_function_privilege('anon', 'add_topup(uuid,text,text,int,int,date)', 'execute') a, has_function_privilege('authenticated', 'claim_founding_slot(uuid,int,int)', 'execute') b, has_table_privilege('authenticated', 'quota_topups', 'select') c",
      )
    ).rows[0];
    expect(r).toEqual({ a: false, b: false, c: false });
  });
});

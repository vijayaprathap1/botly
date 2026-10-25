/** Demo slice of the shared AI budget (migration 0013). */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/botly_test" });

afterAll(() => pool.end());

describe("demo AI budget slice", () => {
  it("stops demo calls at the demo ceiling and still allows a customer call", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const limits = [2, 1000, 100, 100_000];
      const demo = [1, 100, 10, 10_000];
      const first = await client.query(
        "select allowed, reason from ai_budget_try($1,$2,$3,$4,$5,$6,'demo',$7,$8,$9,$10)",
        [1, 10, ...limits, ...demo],
      );
      expect(first.rows[0]).toMatchObject({ allowed: true, reason: "ok" });
      const second = await client.query(
        "select allowed, reason from ai_budget_try($1,$2,$3,$4,$5,$6,'demo',$7,$8,$9,$10)",
        [1, 10, ...limits, ...demo],
      );
      expect(second.rows[0]).toMatchObject({ allowed: false, reason: "minute" });
      const customer = await client.query(
        "select allowed, reason from ai_budget_try($1,$2,$3,$4,$5,$6)",
        [1, 10, ...limits],
      );
      expect(customer.rows[0]).toMatchObject({ allowed: true, reason: "ok" });
      const demoRpm = await client.query("select count from rate_limits where key = 'ai:demo:rpm' order by window_start desc limit 1");
      const sharedRpm = await client.query("select count from rate_limits where key = 'ai:rpm' order by window_start desc limit 1");
      expect(demoRpm.rows[0].count).toBe(1);
      expect(sharedRpm.rows[0].count).toBe(2);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});

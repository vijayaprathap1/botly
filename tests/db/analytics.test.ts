/**
 * Growth metrics on the local database from scripts/local-db.sh.
 *   bash scripts/local-db.sh && DATABASE_URL=postgres://postgres@localhost:5432/botly_test npm run test:db
 */
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/botly_test";
const pool = new pg.Pool({ connectionString: url });

const ORG = "a11ca11c-a11c-411c-811c-a11ca11ca11c";
const BOT = "b071b071-b071-4071-8071-b071b071b071";
const ORG_INTERNAL = "a11ca11c-a11c-411c-811c-a11ca11ca220";
const ORG_DEMO = "a11ca11c-a11c-411c-811c-a11ca11ca330";
const ORG_ACTIVE = "a11ca11c-a11c-411c-811c-a11ca11ca440";
const BOT_ACTIVE = "b071b071-b071-4071-8071-b071b071b440";
const ORG_QUIET = "a11ca11c-a11c-411c-811c-a11ca11ca550";
const BOT_QUIET = "b071b071-b071-4071-8071-b071b071b550";
const ORG_EXPIRED = "a11ca11c-a11c-411c-811c-a11ca11ca660";
const ORG_PAID = "a11ca11c-a11c-411c-811c-a11ca11ca770";
const ORG_GROWTH = "a11ca11c-a11c-411c-811c-a11ca11ca880";
const ORG_HIST = "a11ca11c-a11c-411c-811c-a11ca11ca990";

type Funnel = {
  signups: number;
  bots_live_new: number;
  bots_live_total: number;
  active_trials: number;
  trials_expired: number;
  paid_new: number;
  paid_total: number;
  mrr_inr: number;
  ai_replies: number;
  signups_by_source: Record<string, number>;
};

const ZERO: Funnel = {
  signups: 0,
  bots_live_new: 0,
  bots_live_total: 0,
  active_trials: 0,
  trials_expired: 0,
  paid_new: 0,
  paid_total: 0,
  mrr_inr: 0,
  ai_replies: 0,
  signups_by_source: {},
};

function num(value: unknown): number {
  return Number(value ?? 0);
}

async function funnel(c: pg.PoolClient, day: string): Promise<Funnel> {
  const { rows } = await c.query("select * from metrics.daily_funnel where day = $1::date", [day]);
  const row = rows[0];
  if (!row) return { ...ZERO };
  return {
    signups: num(row.signups),
    bots_live_new: num(row.bots_live_new),
    bots_live_total: num(row.bots_live_total),
    active_trials: num(row.active_trials),
    trials_expired: num(row.trials_expired),
    paid_new: num(row.paid_new),
    paid_total: num(row.paid_total),
    mrr_inr: num(row.mrr_inr),
    ai_replies: num(row.ai_replies),
    signups_by_source: row.signups_by_source ?? {},
  };
}

async function status(c: pg.PoolClient) {
  const { rows } = await c.query("select * from metrics.current_status");
  return rows[0];
}

afterAll(() => pool.end());

describe("metrics views", () => {
  it("counts customer funnels in IST and hides internal and demo workspaces", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const today = (await c.query("select metrics.ist_day(now())::text as d")).rows[0].d as string;
      const day0 = (await c.query("select ($1::date - 5)::text as d", [today])).rows[0].d as string;
      const day1 = (await c.query("select ($1::date - 4)::text as d", [today])).rows[0].d as string;
      const day2 = (await c.query("select ($1::date - 3)::text as d", [today])).rows[0].d as string;
      const istStart = (day: string) => `(${c.escapeLiteral(day)}::timestamp at time zone 'Asia/Kolkata')`;

      expect((await c.query("select metrics.ist_day('2026-10-25 18:29:00+00')::text as d")).rows[0].d).toBe("2026-10-25");
      expect((await c.query("select metrics.ist_day('2026-10-25 18:30:00+00')::text as d")).rows[0].d).toBe("2026-10-26");
      expect((await c.query("select metrics.ist_day('2026-10-25 20:00:00+00')::text as d")).rows[0].d).toBe("2026-10-26");

      const ignored = async (raw: string | null) => (await c.query("select metrics.ignored_origin($1) as v", [raw])).rows[0].v as boolean;
      expect(await ignored(null)).toBe(true);
      expect(await ignored("")).toBe(true);
      expect(await ignored("https://botly.in/start")).toBe(true);
      expect(await ignored("https://www.botly.in")).toBe(true);
      expect(await ignored("https://WWW.BOTLY.IN/")).toBe(true);
      expect(await ignored("https://botly-rosy.vercel.app/demo")).toBe(true);
      expect(await ignored("http://localhost:3000")).toBe(true);
      expect(await ignored("http://127.0.0.1:3000")).toBe(true);
      expect(await ignored("https://shop.example.com/p")).toBe(false);
      expect(await ignored("https://notvercel.app")).toBe(false);
      expect(await ignored("https://botly.in.evil.com")).toBe(false);
      expect(await ignored("https://www.shop.example.com")).toBe(false);

      const before0 = await funnel(c, day0);
      const before1 = await funnel(c, day1);
      const before2 = await funnel(c, day2);
      const beforeToday = await funnel(c, today);
      const beforeStatus = await status(c);

      await c.query(
        `insert into organizations (id, name, plan, created_at, utm_source, self_serve, trial_reply_limit, trial_replies_used, trial_ends_at)
         values ($1, 'Analytics Shop', 'trial', ${istStart(day0)} + interval '2 hours', 'google', true, 50, 0, now() + interval '10 days')`,
        [ORG],
      );
      await c.query(`insert into bots (id, org_id, name, first_seen_origin, first_seen_at) values ($1, $2, 'Shop bot', 'shop.example.com', now())`, [BOT, ORG]);
      await c.query(
        `insert into conversations (bot_id, visitor_id, page_url, is_test, created_at) values
           ($1, 'visitor-shop', 'https://shop.example.com/sarees', false, ${istStart(day0)} + interval '3 hours'),
           ($1, 'visitor-test', 'https://shop.example.com/sarees', true, ${istStart(day0)} + interval '4 hours'),
           ($1, 'visitor-local', 'http://localhost:3000/preview', false, ${istStart(day0)} + interval '5 hours'),
           ($1, 'visitor-botly', 'https://botly.in/demo', false, ${istStart(day0)} + interval '6 hours'),
           ($1, 'visitor-vercel', 'https://preview.vercel.app/', false, ${istStart(day0)} + interval '7 hours')`,
        [BOT],
      );

      await c.query(
        `insert into organizations (id, name, plan, is_internal, subscription_status, utm_source)
         values ($1, 'Internal', 'starter', true, 'active', 'internal')`,
        [ORG_INTERNAL],
      );
      await c.query(
        `insert into organizations (id, name, plan, is_demo, subscription_status, utm_source)
         values ($1, 'Demo', 'growth', true, 'active', 'demo')`,
        [ORG_DEMO],
      );

      await c.query(
        `insert into organizations (id, name, plan, trial_reply_limit, trial_replies_used, trial_ends_at, suspended)
         values ($1, 'Active trial', 'trial', 50, 12, now() + interval '7 days', false)`,
        [ORG_ACTIVE],
      );
      await c.query(`insert into bots (id, org_id, name) values ($1, $2, 'Active bot')`, [BOT_ACTIVE, ORG_ACTIVE]);
      const conv = (await c.query(`insert into conversations (bot_id, visitor_id, page_url, is_test) values ($1, 'visitor-act', 'https://active.example', false) returning id`, [BOT_ACTIVE])).rows[0].id;
      for (let i = 0; i < 10; i++) {
        await c.query(`insert into messages (conversation_id, role, content) values ($1, 'assistant', $2)`, [conv, `reply ${i}`]);
      }
      await c.query(`insert into messages (conversation_id, role, content) values ($1, 'user', 'question')`, [conv]);

      await c.query(
        `insert into organizations (id, name, plan, trial_reply_limit, trial_replies_used, trial_ends_at)
         values ($1, 'Quiet trial', 'trial', 50, 9, now() + interval '7 days')`,
        [ORG_QUIET],
      );
      await c.query(`insert into bots (id, org_id, name) values ($1, $2, 'Quiet bot')`, [BOT_QUIET, ORG_QUIET]);
      const quiet = (await c.query(`insert into conversations (bot_id, visitor_id, page_url, is_test) values ($1, 'visitor-quiet', 'https://quiet.example', false) returning id`, [BOT_QUIET])).rows[0].id;
      for (let i = 0; i < 9; i++) {
        await c.query(`insert into messages (conversation_id, role, content) values ($1, 'assistant', 'n')`, [quiet]);
      }

      await c.query(
        `insert into organizations (id, name, plan, trial_reply_limit, trial_replies_used, trial_ends_at, created_at)
         values ($1, 'Expired trial', 'trial', 50, 1, ${istStart(day1)} + interval '1 hour', ${istStart(day0)})`,
        [ORG_EXPIRED],
      );
      await c.query(
        `insert into organizations (id, name, plan, trial_reply_limit, trial_replies_used, trial_ends_at, subscription_status)
         values ($1, 'Cancelled sub', 'trial', 0, 0, now(), 'cancelled')`,
        ["a11ca11c-a11c-411c-811c-a11ca11cab00"],
      );

      await c.query(
        `insert into organizations (id, name, plan, subscription_status, utm_source)
         values ($1, 'Starter payer', 'starter', 'active', 'direct')`,
        [ORG_PAID],
      );
      await c.query(
        `insert into organizations (id, name, plan, subscription_status)
         values ($1, 'Growth payer', 'growth', 'active')`,
        [ORG_GROWTH],
      );

      await c.query(
        `insert into organizations (id, name, plan, created_at, trial_reply_limit)
         values ($1, 'Historical payer', 'trial', ${istStart(day0)}, 50)`,
        [ORG_HIST],
      );
      const activatedAt = `${istStart(day0)} + interval '3 hours'`;
      const chargedAt = `${istStart(day0)} + interval '4 hours'`;
      const cancelledAt = `${istStart(day2)} + interval '1 hour'`;
      await c.query(
        `insert into analytics_events (event_name, org_id, occurred_at, properties)
         values ('subscription_activated', $1, ${activatedAt}, '{"plan":"starter","amount_inr":2999,"razorpay_subscription_id":"sub_hist"}'::jsonb)`,
        [ORG_HIST],
      );
      await c.query(
        `insert into billing_events (id, org_id, event, created_at, payload)
         values ('evt_charged_hist', $1, 'subscription.charged', ${chargedAt}, '{}'::jsonb)`,
        [ORG_HIST],
      );
      await c.query(
        `insert into billing_events (id, org_id, event, created_at, payload)
         values ('evt_cancel_hist', $1, 'subscription.cancelled', ${cancelledAt}, '{}'::jsonb)`,
        [ORG_HIST],
      );

      await c.query(
        `insert into leads (bot_id, name, phone, created_at)
         values ($1, 'Meera', '+919800011122', now())`,
        [BOT_ACTIVE],
      );

      const after0 = await funnel(c, day0);
      const after1 = await funnel(c, day1);
      const after2 = await funnel(c, day2);
      const afterToday = await funnel(c, today);
      const afterStatus = await status(c);

      expect(after0.signups - before0.signups).toBe(3);
      expect(num(after0.signups_by_source.google) - num(before0.signups_by_source.google)).toBe(1);
      expect(after0.bots_live_new - before0.bots_live_new).toBe(1);
      expect(after0.paid_new - before0.paid_new).toBe(1);
      expect(after0.paid_total - before0.paid_total).toBe(1);
      expect(after0.mrr_inr - before0.mrr_inr).toBe(2999);

      expect(after1.paid_total - before1.paid_total).toBe(1);
      expect(after1.mrr_inr - before1.mrr_inr).toBe(2999);
      expect(after1.trials_expired - before1.trials_expired).toBe(1);
      expect(after1.paid_new - before1.paid_new).toBe(0);

      expect(after2.paid_total - before2.paid_total).toBe(0);
      expect(after2.mrr_inr - before2.mrr_inr).toBe(0);

      expect(afterToday.bots_live_total - beforeToday.bots_live_total).toBe(3);
      expect(afterToday.active_trials - beforeToday.active_trials).toBe(1);
      expect(afterToday.ai_replies - beforeToday.ai_replies).toBe(19);

      expect(num(afterStatus.signups) - num(beforeStatus.signups)).toBe(8);
      expect(num(afterStatus.signups_by_source.google) - num(beforeStatus.signups_by_source.google)).toBe(1);
      expect(num(afterStatus.signups_by_source.internal ?? 0)).toBe(0);
      expect(num(afterStatus.signups_by_source.demo ?? 0)).toBe(0);
      expect(num(afterStatus.bots_live) - num(beforeStatus.bots_live)).toBe(3);
      expect(num(afterStatus.widgets_seen) - num(beforeStatus.widgets_seen)).toBe(1);
      expect(num(afterStatus.active_trials) - num(beforeStatus.active_trials)).toBe(1);
      expect(num(afterStatus.trials_expired) - num(beforeStatus.trials_expired)).toBe(1);
      expect(num(afterStatus.paid) - num(beforeStatus.paid)).toBe(2);
      expect(num(afterStatus.paid_starter) - num(beforeStatus.paid_starter)).toBe(1);
      expect(num(afterStatus.paid_growth) - num(beforeStatus.paid_growth)).toBe(1);
      expect(num(afterStatus.mrr_inr) - num(beforeStatus.mrr_inr)).toBe(2999 + 9999);
      expect(num(afterStatus.ai_replies_today) - num(beforeStatus.ai_replies_today)).toBe(19);
      expect(num(afterStatus.leads_7d) - num(beforeStatus.leads_7d)).toBe(1);

      await c.query("rollback");
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  });

  it("lets the service role write events and only metrics_reader read the views", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(
        `insert into organizations (id, name) values ('a11ca11c-a11c-411c-811c-a11ca11caa01', 'RLS org')`,
      );
      const orgId = "a11ca11c-a11c-411c-811c-a11ca11caa01";

      const rls = (await c.query("select relrowsecurity from pg_class where oid = 'public.analytics_events'::regclass")).rows[0].relrowsecurity;
      expect(rls).toBe(true);
      const policies = (await c.query("select count(*)::int n from pg_policies where schemaname = 'public' and tablename = 'analytics_events'")).rows[0].n;
      expect(policies).toBe(0);

      const expectDenied = async (sql: string, params?: unknown[]) => {
        await c.query("savepoint denied");
        await expect(c.query(sql, params)).rejects.toThrow(/permission denied/);
        await c.query("rollback to savepoint denied");
      };

      await c.query("set local role metrics_reader");
      const snap = await c.query("select signups from metrics.current_status");
      expect(snap.rowCount).toBe(1);
      await c.query("select day from metrics.daily_funnel limit 1");
      await expectDenied("select id from public.organizations limit 1");
      await expectDenied("insert into public.analytics_events (event_name) values ('sign_up')");
      await c.query("reset role");

      await c.query("set local role service_role");
      await c.query(`insert into public.analytics_events (event_name, org_id, properties) values ('sign_up', $1, '{"method":"email"}'::jsonb)`, [orgId]);
      await c.query("savepoint dup");
      await expect(
        c.query(`insert into public.analytics_events (event_name, org_id) values ('sign_up', $1)`, [orgId]),
      ).rejects.toThrow(/duplicate key|unique/);
      await c.query("rollback to savepoint dup");
      const seen = (await c.query("select count(*)::int n from public.analytics_events where org_id = $1", [orgId])).rows[0].n;
      expect(seen).toBe(1);
      await expectDenied("select * from metrics.daily_funnel");
      await expectDenied("select * from metrics.current_status");
      await c.query("reset role");

      for (const role of ["anon", "authenticated"] as const) {
        await c.query(`set local role ${role}`);
        await expectDenied("select * from public.analytics_events");
        await expectDenied("insert into public.analytics_events (event_name) values ('sign_up')");
        await expectDenied("select * from metrics.current_status");
        await c.query("reset role");
      }

      const schema = (await c.query("select has_schema_privilege('anon', 'metrics', 'usage') as anon, has_schema_privilege('authenticated', 'metrics', 'usage') as auth, has_schema_privilege('service_role', 'metrics', 'usage') as svc")).rows[0];
      expect(schema.anon).toBe(false);
      expect(schema.auth).toBe(false);
      expect(schema.svc).toBe(false);

      await c.query("rollback");
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { attributionColumns, attributionFromFields, cleanLandingPath, cleanReferrer, firstTouchFrom, parseStoredFirstTouch, signUpProperties, signupMethod } from "@/lib/analytics/attribution";
import { cloudflareBeaconToken } from "@/lib/analytics/beacon";
import { billingTrackFor, CHECKOUT_BILLING_PERIOD } from "@/lib/analytics/billing-events";
import { customerHost, hostOf, isIgnoredAnalyticsHost } from "@/lib/analytics/hosts";
import { plans } from "@/lib/plans";
import { cleanProperties, deliverAnalyticsEvent, quietDeadline, toAnalyticsRow, track, type AnalyticsWriter } from "@/lib/analytics/track";
import { recordWidgetFirstLoad } from "@/lib/analytics/widget-seen";

const root = path.resolve(__dirname, "../..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe("ignored hosts", () => {
  it("drops Botly, Vercel previews and loopback, and keeps a customer site", () => {
    expect(customerHost("https://botly.in/app")).toBeNull();
    expect(customerHost("https://www.botly.in")).toBeNull();
    expect(customerHost("https://WWW.BOTLY.IN.")).toBeNull();
    expect(customerHost("https://botly-rosy.vercel.app/demo")).toBeNull();
    expect(customerHost("http://localhost:3000")).toBeNull();
    expect(customerHost("http://127.0.0.1:3000/x")).toBeNull();
    expect(customerHost(null)).toBeNull();
    expect(customerHost("not a url")).toBeNull();
    expect(customerHost("javascript:alert(1)")).toBeNull();
    expect(customerHost("https://shop.example.com/products")).toBe("shop.example.com");
    expect(customerHost("https://notvercel.app")).toBe("notvercel.app");
    expect(customerHost("https://botly.in.evil.com")).toBe("botly.in.evil.com");
    expect(customerHost("https://www.shop.example.com")).toBe("www.shop.example.com");
    expect(hostOf("https://Shop.Example.com:443/a")).toBe("shop.example.com");
    expect(isIgnoredAnalyticsHost("foo.vercel.app")).toBe(true);
    expect(isIgnoredAnalyticsHost("vercel.app")).toBe(false);
  });
});

describe("first touch", () => {
  it("defaults a missing source to direct and keeps the campaign fields", () => {
    const touch = firstTouchFrom({
      search: "?utm_source=google&utm_medium=cpc&utm_campaign=launch&utm_content=ad1&utm_term=chatbot",
      referrer: "https://www.google.com/search?q=botly",
      path: "/start?utm_source=google",
    });
    expect(touch.utm_source).toBe("google");
    expect(attributionColumns(touch)).toMatchObject({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "launch",
      utm_content: "ad1",
      utm_term: "chatbot",
      referrer: "https://www.google.com/search?q=botly",
      landing_path: "/start?utm_source=google",
    });
    expect(firstTouchFrom({ search: "", referrer: "", path: "/" }).utm_source).toBe("direct");
    expect(attributionColumns(firstTouchFrom({ search: "", referrer: "", path: "/" })).utm_medium).toBeNull();
  });

  it("drops hostile referrers and off-site landing paths", () => {
    expect(cleanReferrer("javascript:alert(1)")).toBe("");
    expect(cleanReferrer("data:text/html,hi")).toBe("");
    expect(cleanLandingPath("//evil.example/phish")).toBe("/");
    expect(cleanLandingPath("https://botly.in/pricing?utm_source=x")).toBe("/pricing?utm_source=x");
    const parsed = parseStoredFirstTouch("{");
    expect(parsed).toBeNull();
    const stored = parseStoredFirstTouch(JSON.stringify({ utm_source: "", referrer: "javascript:x", landing_path: "/start" }));
    expect(stored?.utm_source).toBe("direct");
    expect(stored?.referrer).toBe("");
    expect(stored?.landing_path).toBe("/start");
  });

  it("reads signup form fields and the Google provider", () => {
    const fields = new Map<string, string>([
      ["utm_source", "newsletter"],
      ["utm_medium", "email"],
      ["referrer", "https://news.example/issue"],
      ["landing_path", "/"],
    ]);
    const touch = attributionFromFields({ get: (name) => fields.get(name) ?? null });
    expect(signUpProperties("email", touch)).toEqual({
      method: "email",
      utm_source: "newsletter",
      utm_medium: "email",
      referrer: "https://news.example/issue",
      landing_path: "/",
    });
    expect(signupMethod({ app_metadata: { provider: "google" } })).toBe("google");
    expect(signupMethod({ app_metadata: { provider: "email" } })).toBe("email");
    expect(signupMethod(null)).toBe("email");
  });
});

describe("cloudflare beacon token", () => {
  it("accepts a token and ignores empty or odd values", () => {
    expect(cloudflareBeaconToken("")).toBeNull();
    expect(cloudflareBeaconToken("   ")).toBeNull();
    expect(cloudflareBeaconToken("short")).toBeNull();
    expect(cloudflareBeaconToken("bad token!")).toBeNull();
    expect(cloudflareBeaconToken('abc"onload=')).toBeNull();
    expect(cloudflareBeaconToken("Abcd_ef-12")).toBe("Abcd_ef-12");
  });
});

describe("billing events", () => {
  it("maps Razorpay events onto the spec names", () => {
    expect(billingTrackFor("subscription.activated")).toEqual({ name: "subscription_activated" });
    expect(billingTrackFor("subscription.authenticated")).toEqual({ name: "subscription_activated" });
    expect(billingTrackFor("subscription.charged")).toEqual({ name: "subscription_activated" });
    expect(billingTrackFor("subscription.pending")).toEqual({ name: "payment_failed", reason: "pending" });
    expect(billingTrackFor("subscription.halted")).toEqual({ name: "payment_failed", reason: "halted" });
    expect(billingTrackFor("payment.failed", { errorReason: "insufficient_funds" })).toEqual({ name: "payment_failed", reason: "insufficient_funds" });
    expect(billingTrackFor("subscription.cancelled")).toEqual({ name: "subscription_cancelled", reason: "cancelled" });
    expect(billingTrackFor("subscription.completed")).toEqual({ name: "subscription_cancelled", reason: "completed" });
    expect(billingTrackFor("subscription.expired")).toEqual({ name: "subscription_cancelled", reason: "expired" });
    expect(billingTrackFor("subscription.updated")).toBeNull();
    expect(CHECKOUT_BILLING_PERIOD).toBe("monthly");
  });
});

describe("track()", () => {
  it("keeps flat properties and a real uuid, and drops the rest", () => {
    const row = toAnalyticsRow({
      name: "lead_captured",
      orgId: "00000000-0000-4000-8000-00000000a001",
      botId: "not-a-uuid",
      properties: { bot_id: "00000000-0000-4000-8000-00000000b001", nested: { a: 1 }, "bad-key": 1, n: 2, ok: true, empty: null, big: "x".repeat(600) },
      occurredAt: new Date("2026-10-25T18:30:00.000Z"),
    });
    expect(row.org_id).toBe("00000000-0000-4000-8000-00000000a001");
    expect(row.bot_id).toBeNull();
    expect(row.occurred_at).toBe("2026-10-25T18:30:00.000Z");
    expect(row.properties).toEqual({ bot_id: "00000000-0000-4000-8000-00000000b001", n: 2, ok: true, empty: null, big: "x".repeat(500) });
    expect(cleanProperties({ a: Number.NaN, b: Infinity })).toEqual({});
  });

  it("swallows duplicates, a missing table, a timeout, and a thrown writer", async () => {
    const dup: AnalyticsWriter = async () => ({ code: "23505", message: "duplicate" });
    expect(await deliverAnalyticsEvent(dup, { name: "sign_up" })).toBe("duplicate");
    const missing: AnalyticsWriter = async () => ({ message: 'relation "analytics_events" does not exist' });
    expect(await deliverAnalyticsEvent(missing, { name: "sign_up" })).toBe("unavailable");
    const hung: AnalyticsWriter = () => new Promise(() => {});
    expect(await deliverAnalyticsEvent(hung, { name: "sign_up" }, 20)).toBe("timeout");
    const boom: AnalyticsWriter = async () => {
      throw new Error("network down");
    };
    expect(await deliverAnalyticsEvent(boom, { name: "sign_up" })).toBe("error");
    const ok: AnalyticsWriter = async () => null;
    expect(await deliverAnalyticsEvent(ok, { name: "checkout_started" })).toBe("ok");
    await expect(track({ name: "sign_up", orgId: "00000000-0000-4000-8000-00000000a001" })).resolves.toBeUndefined();
    await expect(quietDeadline(new Promise(() => {}), 20)).resolves.toBeUndefined();
    await expect(quietDeadline(Promise.reject(new Error("x")), 50)).resolves.toBeUndefined();
    await expect(quietDeadline(Promise.resolve(7), 50)).resolves.toBe(7);
  });
});

describe("widget first load", () => {
  it("ignores our own hosts and writes the customer hostname once", async () => {
    const calls: unknown[] = [];
    const db = {
      from() {
        return {
          update(patch: unknown) {
            calls.push(patch);
            return {
              eq() {
                return {
                  is() {
                    return { select: async () => ({ data: [{ id: "bot" }], error: null }) };
                  },
                };
              },
            };
          },
        };
      },
    };
    await recordWidgetFirstLoad(db as never, { id: "00000000-0000-4000-8000-00000000b001", org_id: "00000000-0000-4000-8000-00000000a001" }, "https://localhost:3000");
    expect(calls).toHaveLength(0);
    await recordWidgetFirstLoad(db as never, { id: "00000000-0000-4000-8000-00000000b001", org_id: "00000000-0000-4000-8000-00000000a001", first_seen_origin: "shop.example.com" }, "https://shop.example.com");
    expect(calls).toHaveLength(0);
    await recordWidgetFirstLoad(db as never, { id: "00000000-0000-4000-8000-00000000b001", org_id: "00000000-0000-4000-8000-00000000a001" }, "https://shop.example.com/page");
    expect(calls).toEqual([expect.objectContaining({ first_seen_origin: "shop.example.com" })]);
  });
});

describe("analytics migration", () => {
  const sql = readFileSync(path.join(root, "supabase/migrations/0011_analytics.sql"), "utf8");
  const manual = readFileSync(path.join(root, "supabase/manual/metrics_reader.sql"), "utf8");

  it("prices match the plan defaults and the reader role has no password", () => {
    const prevStarter = process.env.PRICE_STARTER_INR;
    const prevGrowth = process.env.PRICE_GROWTH_INR;
    delete process.env.PRICE_STARTER_INR;
    delete process.env.PRICE_GROWTH_INR;
    try {
      expect(plans().starter.priceInr).toBe(2999);
      expect(plans().growth.priceInr).toBe(9999);
    } finally {
      if (prevStarter !== undefined) process.env.PRICE_STARTER_INR = prevStarter;
      if (prevGrowth !== undefined) process.env.PRICE_GROWTH_INR = prevGrowth;
    }
    expect(sql).toContain("when 'starter' then 2999");
    expect(sql).toContain("when 'growth' then 9999");
    const uncommented = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(uncommented.toLowerCase()).not.toContain("password");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("create role metrics_reader nologin");
    expect(sql).toContain("metrics.daily_funnel");
    expect(sql).toContain("metrics.current_status");
    expect(uncommented).not.toContain("pgrst.db_schemas");
    const live = manual
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(live.toLowerCase()).not.toContain("password");
  });

  it("does not put the beacon or Google Analytics in the widget bundle sources", () => {
    const widget = walk(path.join(root, "widget/src")).map((file) => readFileSync(file, "utf8")).join("\n");
    expect(widget).not.toMatch(/cloudflareinsights|cf-beacon|googletagmanager|gtag\(|google-analytics/i);
    const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
    expect(layout).toContain("CloudflareWebAnalytics");
    const privacy = readFileSync(path.join(root, "app/privacy-policy/page.tsx"), "utf8");
    expect(privacy).toMatch(/Cloudflare/);
    expect(privacy.toLowerCase()).toContain("local storage");
    const example = readFileSync(path.join(root, ".env.example"), "utf8");
    expect(example).toContain("NEXT_PUBLIC_CF_BEACON_TOKEN=");
  });
});

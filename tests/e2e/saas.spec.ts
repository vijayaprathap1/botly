import { createHmac } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

/** Self-serve SaaS: sign-up → onboarding → preview + embed → trial limit → Razorpay → super admin. */
const APP = process.env.E2E_APP_URL ?? "http://localhost:3000";
const LOG = process.env.MAGIC_LINK_LOG;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/botly_test" });
test.skip(!LOG, "Needs the local harness");
test.describe.configure({ mode: "serial" });

let rzp: http.Server;
const subs = new Map<string, { id: string; plan_id: string; status: string; current_start: number; current_end: number; notes: Record<string, string> }>();
test.beforeAll(async () => {
  rzp = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "POST" && req.url === "/v1/subscriptions") {
        const body = JSON.parse(b);
        const s = { id: `sub_${Date.now()}`, plan_id: body.plan_id, status: "created", current_start: 0, current_end: 0, notes: body.notes };
        subs.set(s.id, s);
        return void res.end(JSON.stringify(s));
      }
      const m = /^\/v1\/subscriptions\/([^/]+)$/.exec(req.url!);
      if (m && subs.has(m[1]!)) {
        const s = subs.get(m[1]!)!;
        return void res.end(JSON.stringify({ ...s, status: "active", current_start: 1_790_000_000, current_end: 1_792_600_000 }));
      }
      res.writeHead(404).end("{}");
    });
  });
  await new Promise<void>((r) => rzp.listen(54360, r));
});
test.afterAll(async () => {
  rzp.close();
  await pool.end();
});

async function signIn(page: Page, email: string) {
  await page.goto(`${APP}/login?signup=1`);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  const before = fs.existsSync(LOG!) ? fs.readFileSync(LOG!, "utf8").length : 0;
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check");
  const line = fs.readFileSync(LOG!, "utf8").slice(before).trim().split("\n").filter((l) => l.startsWith(email)).pop()!;
  await page.goto(line.split(" ")[1]!);
}

test("landing page sells: hero, pricing, start free", async ({ page }) => {
  await page.goto(APP);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("in your customers' language");
  await expect(page.locator("#pricing")).toContainText("₹2,999");
  await expect(page.locator("#pricing")).toContainText("₹9,999");
  await page.getByRole("link", { name: "Build my assistant free" }).first().click();
  await expect(page).toHaveURL(/\/login\?signup=1/);
  await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();
  expect((await page.request.get(`${APP}/terms`)).status()).toBe(200);
  expect((await page.request.get(`${APP}/privacy-policy`)).status()).toBe(200);
});

test("new user signs up, builds an assistant from website + social text, previews it, installs it, hits the trial limit, upgrades", async ({ page, browser }) => {
  test.skip(page.viewportSize()!.width < 640, "desktop");
  test.setTimeout(120_000);
  const email = `owner${Date.now()}@shop.test`;
  await signIn(page, email);
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "Set up your AI assistant" })).toBeVisible();

  // Validation keeps what was typed.
  await page.getByLabel("Business name").fill("Meenakshi Silks");
  await page.getByLabel("Instagram").fill("instagram.com/meenakshisilks");
  await page.getByLabel("I own or represent this business", { exact: false }).check();
  await page.getByRole("button", { name: "Create my assistant" }).click();
  await expect(page.getByText("Add your website, or tell us about your business")).toBeVisible();
  await expect(page.getByLabel("Business name")).toHaveValue("Meenakshi Silks");

  await page.getByLabel("Website (optional)").fill("http://localhost:4173/site");
  await page.getByLabel("Paste your profile bios / About sections").fill("Handwoven Madurai cotton sarees since 1987. Bridal silk collection. DM for bulk orders.");
  await page.getByLabel("Opening hours").fill("Every day 10 am to 8 pm");
  await page.getByLabel("WhatsApp for leads").fill("9000011111");
  await page.getByRole("button", { name: "Create my assistant" }).click();
  await expect(page.getByText("Building your assistant")).toBeVisible();
  await expect(page).toHaveURL(/\/app\/bots\/[0-9a-f-]+\?welcome=1/, { timeout: 90_000 });

  await expect(page.getByText("Your assistant is ready.")).toBeVisible();
  await expect(page.getByText(/Free trial/).first()).toBeVisible();
  await expect(page.getByText(/\d+ of 50 replies left/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Business profile" })).toBeVisible();
  const snippet = await page.locator("pre code").first().innerText();
  expect(snippet).toMatch(/data-key="pk_[a-z0-9]+"/);
  const botId = /\/app\/bots\/([0-9a-f-]+)/.exec(page.url())![1]!;

  // The owner's typed details are approved knowledge; crawled pages exist; safety check ran.
  const { rows: ks } = await pool.query("select type, title, status from knowledge_sources where bot_id = $1", [botId]);
  expect(ks.find((k) => k.title === "Details from the owner")?.status).toBe("approved");
  expect(ks.some((k) => k.title === "Returns policy")).toBe(true);
  const { rows: runs } = await pool.query("select total from eval_runs where bot_id = $1", [botId]);
  expect(runs[0].total).toBe(4);

  // Customer-level screens: knowledge, settings (no model/plan), preview, billing; no super admin.
  await page.getByRole("link", { name: "Knowledge", exact: true }).click();
  await expect(page.getByRole("link", { name: "Details from the owner" })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Model")).toBeHidden();
  await expect(page.getByRole("link", { name: "Super admin" })).toHaveCount(0);
  expect((await page.request.get(`${APP}/app/admin`, { maxRedirects: 0 })).status()).toBe(307);

  // The trial limit: set used replies to the limit, then the widget shows contact details instead.
  const { rows: bots } = await pool.query("select public_key, org_id from bots where id = $1", [botId]);
  await pool.query("update organizations set trial_replies_used = trial_reply_limit where id = $1", [bots[0].org_id]);
  const chat = await page.request.post(`${APP}/api/chat`, {
    headers: { "Content-Type": "text/plain", Origin: "http://localhost:4173" },
    data: JSON.stringify({ key: bots[0].public_key, visitorId: "visitor_trial_end_1", message: "Hi" }),
  });
  const text = await chat.text();
  expect(text).toContain('"type":"fallback_contact"');
  expect(text).toContain("trial_ended");
  await page.goto(`${APP}/app/bots/${botId}`);
  await expect(page.getByText("Your free trial has ended.").first()).toBeVisible();

  // Upgrade: Billing → Razorpay subscription → verified payment → Starter active.
  await page.goto(`${APP}/app/billing`);
  await expect(page.getByRole("heading", { name: "Plan and billing" })).toBeVisible();
  const { startCheckout } = { startCheckout: null }; void startCheckout;
  // Checkout.js can't load offline; exercise the server steps the button performs.
  await page.getByRole("button", { name: "Choose Starter" }).click();
  await expect.poll(async () => (await pool.query("select razorpay_subscription_id from organizations where id = $1", [bots[0].org_id])).rows[0].razorpay_subscription_id).toMatch(/^sub_/);
  const subId = (await pool.query("select razorpay_subscription_id from organizations where id = $1", [bots[0].org_id])).rows[0].razorpay_subscription_id as string;
  const sig = createHmac("sha256", "local_rzp_secret").update(`pay_test_1|${subId}`).digest("hex");
  const bad = await page.request.post(`${APP}/api/billing/verify`, { data: { orgId: bots[0].org_id, razorpay_payment_id: "pay_test_1", razorpay_subscription_id: subId, razorpay_signature: "0".repeat(64) } });
  expect(bad.status()).toBe(400);
  const ok = await page.request.post(`${APP}/api/billing/verify`, { data: { orgId: bots[0].org_id, razorpay_payment_id: "pay_test_1", razorpay_subscription_id: subId, razorpay_signature: sig } });
  expect((await ok.json()).ok).toBe(true);
  const { rows: org } = await pool.query("select plan, subscription_status, monthly_conversation_quota from organizations where id = $1", [bots[0].org_id]);
  expect(org[0]).toEqual({ plan: "starter", subscription_status: "active", monthly_conversation_quota: 2000 });
  const again = await page.request.post(`${APP}/api/chat`, {
    headers: { "Content-Type": "text/plain", Origin: "http://localhost:4173" },
    data: JSON.stringify({ key: bots[0].public_key, visitorId: "visitor_paid_1", message: "Hi" }),
  });
  expect(await again.text()).not.toContain("trial_ended");

  // Webhook: bad signature refused; a halted subscription stops the service; duplicates ignored.
  const halted = JSON.stringify({ event: "subscription.halted", payload: { subscription: { entity: { id: subId, plan_id: "plan_starter_test", status: "halted", current_start: 1, current_end: 2, notes: { org_id: bots[0].org_id } } } } });
  expect((await page.request.post(`${APP}/api/billing/webhook`, { headers: { "Content-Type": "application/json", "x-razorpay-signature": "nope" }, data: halted })).status()).toBe(400);
  const hsig = createHmac("sha256", "local_hook_secret").update(halted).digest("hex");
  const w1 = await page.request.post(`${APP}/api/billing/webhook`, { headers: { "Content-Type": "application/json", "x-razorpay-signature": hsig, "x-razorpay-event-id": "evt_halt_1" }, data: halted });
  expect((await w1.json()).ok).toBe(true);
  const w2 = await page.request.post(`${APP}/api/billing/webhook`, { headers: { "Content-Type": "application/json", "x-razorpay-signature": hsig, "x-razorpay-event-id": "evt_halt_1" }, data: halted });
  expect((await w2.json()).duplicate).toBe(true);
  expect((await pool.query("select subscription_status from organizations where id = $1", [bots[0].org_id])).rows[0].subscription_status).toBe("halted");

  // Super admin sees the customer and can extend their trial.
  const admin = await browser.newPage();
  await signIn(admin, "admin@botly.test");
  await admin.goto(`${APP}/app/admin`);
  await expect(admin.getByRole("heading", { name: "Super admin" })).toBeVisible();
  await expect(admin.getByText("Meenakshi Silks").first()).toBeVisible();
  await expect(admin.getByText("MRR", { exact: true })).toBeVisible();
  await admin.getByLabel("Actions for Meenakshi Silks").first().selectOption("extend");
  await expect.poll(async () => (await pool.query("select plan from organizations where id = $1", [bots[0].org_id])).rows[0].plan).toBe("trial");
  await admin.close();
});

test("one free trial per email", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 640, "desktop");
  await pool.query("insert into trial_claims (email) values ('repeat@shop.test') on conflict do nothing");
  await signIn(page, "repeat@shop.test");
  await expect(page).toHaveURL(/\/start$/);
  await page.getByLabel("Business name").fill("Repeat Shop");
  await page.getByLabel("About your business, products and prices").fill("We sell handmade candles in Pune. Prices from ₹299. Delivery across India in 5 days.");
  await page.getByLabel("I own or represent this business", { exact: false }).check();
  await page.getByRole("button", { name: "Create my assistant" }).click();
  await expect(page).toHaveURL(/\/app\/bots\//, { timeout: 90_000 });
  await expect(page.getByText("Your free trial has ended.").first()).toBeVisible();
});

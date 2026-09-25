import fs from "node:fs";
import http from "node:http";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

/**
 * Phase 2 + 3 end to end (local harness): unanswered inbox, reports, client (owner)
 * access, data deletion, Shopify order lookup against a fake store, callback booking.
 */
const APP = process.env.E2E_APP_URL ?? "http://localhost:3000";
const SITE = "http://localhost:4173";
const LOG = process.env.MAGIC_LINK_LOG;
const DB = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/botly_test";
const BOT = "00000000-0000-4000-8000-00000000b001";
const ORG = "00000000-0000-4000-8000-00000000a001";

test.skip(!LOG, "Needs the local harness (MAGIC_LINK_LOG)");
test.describe.configure({ mode: "serial" });

let shop: http.Server;
const pool = new pg.Pool({ connectionString: DB });

test.beforeAll(async () => {
  shop = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.headers["x-shopify-access-token"] !== "shpat_e2etoken1234567890") return void res.writeHead(401).end("{}");
      const q = JSON.parse(b || "{}");
      if (String(q.query).includes("shop {")) return void res.end(JSON.stringify({ data: { shop: { name: "Ananya" } } }));
      const hit = String(q.variables?.q ?? "").includes("1042");
      res.end(JSON.stringify({ data: { orders: { nodes: hit ? [{
        name: "#1042", email: "priya@example.in", phone: "+919790011223", displayFulfillmentStatus: "FULFILLED", cancelledAt: null,
        customer: null, shippingAddress: { phone: "12 Secret Street" }, billingAddress: null,
        fulfillments: [{ displayStatus: "IN_TRANSIT", estimatedDeliveryAt: "2026-10-01T10:00:00Z", trackingInfo: [{ company: "Delhivery", number: "DL1", url: "https://track.example/DL1" }] }],
      }] : [] } } }));
    });
  });
  await new Promise<void>((r) => shop.listen(54350, r));
  await pool.query("update organizations set plan = 'growth' where id = $1", [ORG]);
});
test.afterAll(async () => {
  await pool.query("update organizations set plan = 'starter' where id = $1", [ORG]);
  await pool.end();
  shop.close();
});

async function signIn(page: Page, email: string) {
  await page.goto(`${APP}/login`);
  const before = fs.existsSync(LOG!) ? fs.readFileSync(LOG!, "utf8").length : 0;
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check");
  const line = fs.readFileSync(LOG!, "utf8").slice(before).trim().split("\n").filter((l) => l.startsWith(email)).pop()!;
  await page.goto(line.split(" ")[1]!);
  await expect(page).toHaveURL(/\/app$/);
}
const panel = (p: Page) => p.locator("#botly-widget .panel");
const say = async (p: Page, text: string) => {
  await p.locator("#botly-widget .composer textarea").fill(text);
  // The widget ignores Enter while the previous reply is still streaming.
  await expect(p.locator("#botly-widget .composer button").last()).toBeEnabled({ timeout: 15_000 });
  await p.locator("#botly-widget .composer textarea").press("Enter");
};

test("admin connects Shopify; visitor looks up an order (verified) and books a callback", async ({ page, browser }) => {
  test.skip(page.viewportSize()!.width < 640, "desktop");
  await signIn(page, "admin@botly.test");
  await page.goto(`${APP}/app/bots/${BOT}/settings`);
  await page.getByLabel("Store URL").fill("http://localhost:54350");
  await page.getByLabel("Admin API access token").fill("shpat_wrongtoken000000000");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText(/Couldn't connect/)).toBeVisible();
  await page.getByLabel("Admin API access token").fill("shpat_e2etoken1234567890");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Connected. The assistant can now look up orders")).toBeVisible();
  const { rows } = await pool.query("select credentials_encrypted from bot_integrations where bot_id = $1", [BOT]);
  expect(rows[0].credentials_encrypted).not.toContain("shpat_e2etoken");

  const v = await browser.newPage();
  await v.goto(`${SITE}/plain.html`);
  await v.locator("#botly-widget .launcher").click();
  await say(v, "Where is order #1042? My phone is 9000000000");
  await expect(panel(v)).toContainText("couldn't find an order", { timeout: 15_000 });
  await say(v, "Sorry, order #1042, phone 9790011223");
  const card = panel(v).locator(".card", { hasText: "Order #1042" });
  await expect(card).toContainText("In transit", { timeout: 15_000 });
  await expect(card).toContainText("Delhivery");
  await expect(card.getByRole("link", { name: "Track package" })).toHaveAttribute("href", "https://track.example/DL1");
  await expect(panel(v)).not.toContainText("Secret Street");

  await say(v, "Can you arrange a callback tomorrow?");
  const form = panel(v).locator("form[aria-label='Book a callback']");
  await expect(form).toBeVisible({ timeout: 15_000 });
  await form.getByLabel("Your name").fill("Meena");
  await form.getByLabel("Phone number").fill("9790011223");
  await form.getByLabel("Time").selectOption({ index: 2 });
  await form.getByRole("button", { name: "Book callback" }).click();
  await expect(panel(v)).toContainText("Callback booked for");
  const lead = await pool.query("select type, preferred_time from leads where bot_id = $1 and type = 'callback' order by created_at desc limit 1", [BOT]);
  expect(lead.rows[0].preferred_time).toMatch(/^\d{4}-\d{2}-\d{2}, Evening/);
  await v.close();
});

test("unanswered inbox: one-step answer becomes approved knowledge", async ({ page, browser }) => {
  test.skip(page.viewportSize()!.width < 640, "desktop");
  const v = await browser.newPage();
  await v.goto(`${SITE}/plain.html`);
  await v.locator("#botly-widget .launcher").click();
  await say(v, "unknown: do you offer saree draping lessons?");
  await expect(panel(v)).toContainText("don't have that information", { timeout: 15_000 });
  await v.close();

  await signIn(page, "admin@botly.test");
  await page.goto(`${APP}/app/bots/${BOT}/unanswered`);
  await expect(page.getByText("do you offer saree draping lessons?").first()).toBeVisible();
  const q = page.locator("section", { hasText: "saree draping lessons" }).first();
  await q.getByLabel("Question as it will appear in the knowledge").fill("Do you offer saree draping lessons?");
  await q.getByRole("textbox", { name: /Answer for/ }).fill("Yes, free draping help at the Kanchipuram store on Saturdays.");
  await q.getByRole("button", { name: "Answer and add to knowledge" }).click();
  await expect(page.getByText("Added to the knowledge.")).toBeVisible();
  await expect
    .poll(async () => (await pool.query("select status, type from knowledge_sources where bot_id = $1 and title = 'Do you offer saree draping lessons?'", [BOT])).rows[0])
    .toEqual({ status: "approved", type: "faq" });
});

test("reports: monthly numbers and CSV", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 640, "desktop");
  await signIn(page, "admin@botly.test");
  await page.goto(`${APP}/app/bots/${BOT}/reports`);
  await expect(page.getByRole("heading", { name: /Monthly report/ })).toBeVisible();
  await expect(page.getByText("Top questions")).toBeVisible();
  await expect(page.getByText("Hours saved (est.)")).toBeVisible();
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date());
  const csv = await (await page.request.get(`${APP}/api/reports?bot=${BOT}&month=${month}`)).text();
  expect(csv).toContain("Conversations,");
  expect(csv).toContain("Hour of day,Conversations");
});

test("client access: owner sees only their business, no cost, can suggest answers; admin deletes a visitor's data", async ({ page, browser }) => {
  test.skip(page.viewportSize()!.width < 640, "desktop");
  await signIn(page, "admin@botly.test");
  await page.goto(`${APP}/app/bots/${BOT}`);
  await page.getByLabel("Client email").fill("owner3@ananya.test");
  await page.getByRole("button", { name: "Give access" }).click();
  await expect(page.getByText("Invited owner3@ananya.test")).toBeVisible();

  const owner = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await signIn(owner, "owner3@ananya.test");
  await expect(owner.getByRole("heading", { name: "Your assistants" })).toBeVisible();
  await expect(owner.getByText("Ananya Handlooms").first()).toBeVisible();
  await expect(owner.getByText("Meenakshi Silks")).toHaveCount(0);
  await expect(owner.getByText("Cost")).toHaveCount(0);
  await owner.getByText("Ananya Handlooms").first().click();
  // Clients edit their own assistant, but never platform settings (model, plan, quota).
  await owner.goto(`${APP}/app/bots/${BOT}/settings`);
  await expect(owner.getByLabel("Greeting")).toBeVisible();
  await expect(owner.getByLabel("Model")).toBeHidden();
  await expect(owner.getByText("Super admin")).toHaveCount(0);
  // Owner suggests an answer
  await pool.query("select merge_unanswered($1, null, 'Is there parking near the store?', 'en')", [BOT]);
  await owner.goto(`${APP}/app/bots/${BOT}/unanswered`);
  const q = owner.locator("section", { hasText: "Is there parking near the store?" });
  await q.getByRole("textbox").fill("Yes, street parking on Gandhi Street.");
  await q.getByRole("button", { name: "Suggest answer" }).click();
  await expect(owner.getByText("Thanks! Your answer will be reviewed")).toBeVisible();
  expect(await owner.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await owner.close();

  await page.goto(`${APP}/app/bots/${BOT}/unanswered`);
  await expect(page.getByText("Client suggested:").first()).toBeVisible();

  // DPDP deletion by phone
  await page.goto(`${APP}/app/bots/${BOT}/settings`);
  await page.getByLabel("Phone number", { exact: true }).fill("9790011223");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete data" }).click();
  await expect(page.getByText(/Deleted \d+ conversation\(s\) and \d+ lead\(s\)/)).toBeVisible();
  const left = await pool.query("select count(*)::int n from leads where bot_id = $1 and phone = '+919790011223'", [BOT]);
  expect(left.rows[0].n).toBe(0);
});

test("cron endpoints refuse without the secret, run with it", async ({ request }) => {
  expect((await request.get(`${APP}/api/cron/retention`)).status()).toBe(401);
  const r = await request.get(`${APP}/api/cron/weekly`, { headers: { Authorization: "Bearer local-cron-secret-1234567890" } });
  expect(r.status()).toBe(200);
  expect(await r.json()).toMatchObject({ ok: true, bots: 1 });
  const ok = await request.get(`${APP}/api/cron/retention`, { headers: { Authorization: "Bearer local-cron-secret-1234567890" } });
  expect((await ok.json()).ok).toBe(true);
});

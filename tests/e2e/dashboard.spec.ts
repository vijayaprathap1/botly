import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Dashboard flow. Needs the local test harness (scripts/local-stack), which writes
 * magic links to MAGIC_LINK_LOG instead of emailing them.
 */
const APP = process.env.E2E_APP_URL ?? "http://localhost:3000";
const LOG = process.env.MAGIC_LINK_LOG;
const BOT = "00000000-0000-4000-8000-00000000b001";

test.skip(!LOG, "Set MAGIC_LINK_LOG (local harness) to run dashboard tests");

async function signIn(page: Page, email: string) {
  await page.goto(`${APP}/app`);
  await expect(page).toHaveURL(/\/login/);
  const before = fs.existsSync(LOG!) ? fs.readFileSync(LOG!, "utf8").length : 0;
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check");
  const line = fs.readFileSync(LOG!, "utf8").slice(before).trim().split("\n").filter((l) => l.startsWith(email)).pop()!;
  await page.goto(line.split(" ")[1]!);
  await expect(page).toHaveURL(/\/app$/);
}

test("admin: sign in, review bot, edit knowledge and settings, playground, conversations, leads", async ({ page }) => {
  test.skip(page.viewportSize()!.width < 640, "desktop flow");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await test.step("magic-link sign in makes ADMIN_EMAILS an admin", async () => {
    await signIn(page, "admin@botly.test");
    await expect(page.getByRole("heading", { name: "Clients and bots" })).toBeVisible();
    await expect(page.getByText("Ananya Handlooms").first()).toBeVisible();
  });

  await test.step("overview shows snippet, test link and launch gate", async () => {
    await page.getByText("Ananya Handlooms").first().click();
    await expect(page.locator("pre")).toContainText(`data-key="pk_ananya_demo_0001"`);
    await expect(page.getByText("/t/tt_ananya_demo_private_0001")).toBeVisible();
    // No eval yet: going live runs the prompt-injection safety check first.
    await page.getByRole("button", { name: "Go live" }).click();
    await expect(page.getByRole("button", { name: "Move back to draft" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Last eval .*4\/4/)).toBeVisible();
    await page.getByRole("button", { name: "Move back to draft" }).click();
    await expect(page.getByRole("button", { name: "Go live" })).toBeVisible();
  });

  await test.step("knowledge: add an approved FAQ, it's used on the next message", async () => {
    await page.getByRole("link", { name: "Knowledge" }).click();
    await expect(page.getByText("tokens").first()).toBeVisible();
    await page.getByRole("link", { name: "Add", exact: true }).click();
    await page.getByLabel("Type").selectOption("policy");
    const title = `Aaa gift wrapping ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Content", { exact: true }).fill("- Gift wrapping costs ₹120 per saree.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/knowledge$/);
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    // The scripted model quotes the best-matching approved line → the brand-new policy proves P11.
    const r = await page.request.post(`${APP}/api/chat`, {
      headers: { "Content-Type": "text/plain", Origin: "http://localhost:4173" },
      data: JSON.stringify({ key: "pk_ananya_demo_0001", visitorId: "visitor_p11_check", message: "gift wrap?" }),
    });
    const reply = [...(await r.text()).matchAll(/^data: (.+)$/gm)].map((m) => JSON.parse(m[1]!).text ?? "").join("");
    expect(reply).toContain("Gift wrapping costs ₹120");
  });

  await test.step("settings: save greeting and see it in the widget config", async () => {
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByLabel("Greeting").fill("Vanakkam! Meera here. Ask me anything about our sarees.");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Saved. Changes apply to the next message.")).toBeVisible();
    const cfg = await (await page.request.get(`${APP}/api/widget/config?key=pk_ananya_demo_0001`, { headers: { Origin: "http://localhost:4173" } })).json();
    expect(cfg.greeting).toBe("Vanakkam! Meera here. Ask me anything about our sarees.");
  });

  await test.step("playground: language button streams a reply with debug info", async () => {
    await page.getByRole("link", { name: "Playground" }).click();
    await page.getByRole("button", { name: "Tamil" }).click();
    await expect(page.getByText(/ms first token/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("First token", { exact: true })).toBeVisible();
    await expect(page.getByText("Input / output")).toBeVisible();
  });

  await test.step("conversations: filters and transcript", async () => {
    await page.getByRole("link", { name: "Conversations" }).click();
    await page.getByLabel("Include tests").check();
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByText(/\d+ conversations/)).toBeVisible();
    await page.getByPlaceholder("Search messages").fill("gift wrap");
    await page.getByRole("button", { name: "Filter" }).click();
    await page.locator("ul li a").first().click();
    await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible();
    await expect(page.getByText("gift wrap?")).toBeVisible();
  });

  await test.step("leads: WhatsApp link, status pipeline, CSV export", async () => {
    const lead = await page.request.post(`${APP}/api/widget/lead`, {
      headers: { "Content-Type": "text/plain", Origin: "http://localhost:4173" },
      data: JSON.stringify({ key: "pk_ananya_demo_0001", visitorId: "visitor_lead_dash", name: "Priya E2E", phone: "9790011223", type: "human" }),
    });
    expect((await lead.json()).ok).toBe(true);
    await page.goto(`${APP}/app/bots/${BOT}/leads`);
    await expect(page.getByText("Priya E2E").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "WhatsApp" }).first()).toHaveAttribute("href", /wa\.me\/919790011223/);
    await page.getByLabel("Status for Priya E2E").first().selectOption("contacted");
    await expect(page.getByLabel("Status for Priya E2E").first()).toHaveValue("contacted");
    const csv = await page.request.get(`${APP}/api/admin/export?bot=${BOT}&type=leads&format=csv`);
    expect(await csv.text()).toContain("Priya E2E,+919790011223");
  });

  await test.step("new client + onboarding crawl (robots.txt respected)", async () => {
    await page.goto(`${APP}/app/orgs/new`);
    await page.getByLabel("Business name").fill("Meenakshi Silks");
    await page.getByLabel("Website").fill("http://localhost:4173/site");
    await page.getByRole("button", { name: "Create and continue" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByLabel("Draft FAQs, policy summary and tone with Claude").uncheck(); // needs ANTHROPIC_API_KEY
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByText("Done. Review and approve the drafts in Knowledge.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("robots.txt found and respected")).toBeVisible();
    await page.getByRole("link", { name: "3. Review drafts in Knowledge" }).click();
    await expect(page.getByRole("link", { name: "Returns policy" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Shipping" })).toBeVisible();
    await expect(page.getByText("Staff only")).toHaveCount(0);
    await expect(page.getByText("Site-wide details (header and footer)")).toBeVisible();
    // Bulk approve
    await page.getByLabel("Select all").check();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.locator("ul").getByText("draft", { exact: true })).toHaveCount(0); // bot header still says draft
    await page.getByRole("link", { name: "Approved", exact: true }).click();
    await expect(page.getByRole("link", { name: "Returns policy" })).toBeVisible();
  });

  expect(errors).toEqual([]);
});

test("a new user without a workspace is sent to sign-up onboarding, on a phone too", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 375, height: 740 } });
  const before = fs.existsSync(LOG!) ? fs.readFileSync(LOG!, "utf8").length : 0;
  await page.goto(`${APP}/login`);
  await page.getByLabel("Email").fill("owner@ananya.test");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check");
  const line = fs.readFileSync(LOG!, "utf8").slice(before).trim().split("\n").filter((l) => l.startsWith("owner@ananya.test")).pop()!;
  await page.goto(line.split(" ")[1]!);
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByRole("heading", { name: "Set up your AI assistant" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.close();
});

import { expect, test, type Page } from "@playwright/test";

const APP = process.env.E2E_APP_URL ?? "http://localhost:3000";
const SITE = "http://localhost:4173"; // allowed origin
const OTHER = "http://localhost:4174"; // NOT in allowed_origins
const TEST_TOKEN = process.env.E2E_TEST_TOKEN ?? "tt_ananya_demo_private_0001_change_me_in_production";

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}
const launcher = (page: Page) => page.locator("#botly-widget .launcher");
const panel = (page: Page) => page.locator("#botly-widget .panel");
const composer = (page: Page) => page.locator("#botly-widget .composer textarea");

test("hostile global CSS: widget renders correctly, streams, and never shifts the host layout", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto(`${SITE}/hostile.html`);
  const before = await page.locator("#marker").boundingBox();
  await expect(launcher(page)).toBeVisible();

  // Host CSS (`button { background: red !important }`) must not reach inside the shadow root.
  const bg = await launcher(page).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(159, 18, 57)");
  const box = await launcher(page).boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
  // And our CSS must not leak out: the host's own button keeps its style.
  expect(await page.locator("#host-button").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 0, 0)");

  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText("Vanakkam!");
  await expect(panel(page).locator(".chip")).toHaveCount(3);
  await panel(page).locator(".chip", { hasText: "Is cash on delivery available?" }).click();
  await expect(panel(page).locator(".row.bot .bubble").last()).toContainText("Cash on delivery (COD) is available across India", { timeout: 15_000 });
  await expect(panel(page).locator(".row.bot strong").last()).toBeVisible(); // markdown bold rendered, not raw **
  // Follow-up chips from suggest_followups
  await expect(panel(page).locator(".chip").first()).toHaveText("What is your return policy?");

  expect(await page.locator("#marker").boundingBox()).toEqual(before);
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
  expect(errors).toEqual([]);
});

test("talk to a person: lead form validates Indian numbers, submits, confirms", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto(`${SITE}/plain.html`);
  await launcher(page).click();
  await panel(page).getByRole("button", { name: "Talk to a person" }).click();
  const form = panel(page).locator("form.card");
  await expect(form).toBeVisible();
  await form.getByLabel("Your name").fill("Priya E2E");
  await form.getByLabel("Phone number").fill("12345");
  await form.getByRole("button", { name: "Send to the team" }).click();
  await expect(form.locator(".err")).toContainText("10-digit");
  await form.getByLabel("Phone number").fill("97900 11223");
  await form.getByLabel("What do you need? (optional)").fill("Want to see bridal sarees on video call");
  await form.getByRole("button", { name: "Send to the team" }).click();
  await expect(panel(page).locator(".card.ok")).toContainText("Sent to the team");
  // Pressing it again doesn't ask twice.
  await panel(page).getByRole("button", { name: "Talk to a person" }).click();
  await expect(panel(page)).toContainText("already with the team");
  expect(errors).toEqual([]);
});

test("model-driven handoff shows the lead form card", async ({ page }) => {
  await page.goto(`${SITE}/plain.html`);
  await launcher(page).click();
  await composer(page).fill("Can I talk to a human please?");
  await composer(page).press("Enter");
  await expect(panel(page).locator("form.card")).toBeVisible({ timeout: 15_000 });
  await expect(panel(page).locator("form.card h4")).toHaveText("Talk to a person");
});

test("high z-index sticky header: launcher stays on top and clickable", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto(`${SITE}/sticky.html`);
  await expect(launcher(page)).toBeVisible();
  const b = (await launcher(page).boundingBox())!;
  const topmost = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.id, [b.x + b.width / 2, b.y + b.height / 2]);
  expect(topmost).toBe("botly-widget");
  await page.mouse.wheel(0, 1500);
  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
  const p = (await panel(page).boundingBox())!;
  const atPanelTop = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.id, [p.x + p.width / 2, p.y + 5]);
  expect(atPanelTop).toBe("botly-widget");
  expect(errors).toEqual([]);
});

test("Enter sends, Shift+Enter adds a line, 1000-char limit, Esc closes and returns focus", async ({ page }) => {
  await page.goto(`${SITE}/plain.html`);
  await launcher(page).click();
  const ta = composer(page);
  await ta.fill("line one");
  await ta.press("Shift+Enter");
  await ta.type("line two");
  expect(await ta.inputValue()).toBe("line one\nline two");
  expect(await ta.getAttribute("maxlength")).toBe("1000");
  await ta.press("Enter");
  await expect(panel(page).locator(".row.user .bubble").last()).toHaveText("line one\nline two");
  await expect(panel(page).locator(".row.bot .bubble").last()).not.toBeEmpty({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("botly-widget");
  expect(await launcher(page).getAttribute("aria-expanded")).toBe("false");
});

test("conversation is restored after reload", async ({ page }) => {
  await page.goto(`${SITE}/plain.html`);
  await launcher(page).click();
  await composer(page).fill("How many days to Puducherry?");
  await composer(page).press("Enter");
  await expect(panel(page).locator(".row.bot .bubble").last()).not.toBeEmpty({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await page.reload();
  await launcher(page).click();
  await expect(panel(page).locator(".row.user .bubble")).toContainText(["How many days to Puducherry?"]);
});

test("window.Botly API: open() and sendMessage()", async ({ page }) => {
  await page.goto(`${SITE}/plain.html`);
  await expect(launcher(page)).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { Botly: { identify: (x: object) => void; sendMessage: (t: string) => void } };
    w.Botly.identify({ name: "Asha", phone: "9876501234" });
    w.Botly.sendMessage("What is your return policy?");
  });
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).locator(".row.user .bubble").last()).toHaveText("What is your return policy?");
});

test("origin not allowed: no launcher, no console errors", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto(`${OTHER}/plain.html`);
  await page.waitForTimeout(1500);
  await expect(page.locator("#botly-widget")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("mobile bottom sheet: full screen, background scroll locked, input usable", async ({ page }) => {
  test.skip(page.viewportSize()!.width > 640, "mobile only");
  await page.goto(`${SITE}/sticky.html`);
  await launcher(page).click();
  const vp = page.viewportSize()!;
  const p = (await panel(page).boundingBox())!;
  expect(Math.round(p.width)).toBe(vp.width);
  expect(Math.round(p.height)).toBeGreaterThanOrEqual(vp.height - 1);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
  const input = (await composer(page).boundingBox())!;
  expect(input.y + input.height).toBeLessThanOrEqual(vp.height);
  await composer(page).fill("Is COD available?");
  await composer(page).press("Enter");
  await expect(panel(page).locator(".row.bot .bubble").last()).toContainText("Cash on delivery", { timeout: 15_000 });
  await panel(page).getByRole("button", { name: "Close chat" }).first().click();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
});

test("private test page: full screen, noindex, works while the bot is a draft", async ({ page }) => {
  const res = await page.goto(`${APP}/t/${TEST_TOKEN}`);
  expect(res!.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(panel(page)).toBeVisible();
  const p = (await panel(page).boundingBox())!;
  expect(Math.round(p.width)).toBe(page.viewportSize()!.width);
  await composer(page).fill("பிளவுஸ் தைக்க எவ்வளவு?");
  await composer(page).press("Enter");
  await expect(panel(page).locator(".row.bot .bubble").last()).not.toBeEmpty({ timeout: 15_000 });
  expect((await page.request.get(`${APP}/t/tt_wrong_token_000000000000000000000`)).status()).toBe(404);
});

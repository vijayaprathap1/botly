import "server-only";
import { existsSync } from "node:fs";
import { isIP } from "node:net";
import { assertPublicUrl, isPrivateAddress } from "./url-guard";

/**
 * Rendered mode: for websites that are built in the browser (React, Angular, some Wix
 * and Shopify themes), a plain download is an empty shell. Here a headless Chromium
 * opens the page, lets it build itself, and hands back the finished HTML, plus the
 * readable text of a few pages it links to, for the assistant to learn from.
 *
 * On Vercel the browser comes from @sparticuz/chromium. On a developer machine that
 * package's Linux binary can't run, so an installed Chrome is used instead.
 */
export type RenderedPage = { url: string; title: string; text: string };
export type Rendered = { html: string; finalUrl: string; pages: RenderedPage[] };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const LOCAL_CHROME = [
  process.env.DEMO_CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

export const renderEnabled = () => (process.env.DEMO_RENDER ?? "auto").toLowerCase() !== "off";

async function launch() {
  const puppeteer = (await import("puppeteer-core")).default;
  const viewport = { width: 1366, height: 900 };
  if (process.platform === "linux" && (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || !LOCAL_CHROME.some((p) => p && existsSync(p)))) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true, defaultViewport: viewport });
  }
  const local = LOCAL_CHROME.find((p) => p && existsSync(p));
  if (!local) throw new Error("No browser available to render this page (set DEMO_CHROME_PATH).");
  return puppeteer.launch({ executablePath: local, headless: true, defaultViewport: viewport, args: ["--no-first-run", "--disable-extensions", "--mute-audio"] });
}

// These run inside the page, so they are plain source text: a bundler must not rewrite
// them (helpers it injects, such as name-preserving wrappers, don't exist in the page).

/** The finished document, with styles that scripts injected made part of the HTML. */
const SERIALIZE = String.raw`(() => {
  // CSS-in-JS libraries add rules straight to the stylesheet object, leaving <style> empty.
  for (const el of Array.from(document.querySelectorAll("style"))) {
    try {
      const sheet = el.sheet;
      if (sheet && sheet.cssRules.length && !(el.textContent || "").trim()) el.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
    } catch (e) {}
  }
  try {
    for (const sheet of document.adoptedStyleSheets || []) {
      const s = document.createElement("style");
      s.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
      document.head.appendChild(s);
    }
  } catch (e) {}
  return "<!doctype html>\n" + document.documentElement.outerHTML;
})()`;

/** The text a person would read, and the links to the site's own pages. */
const READABLE = String.raw`(() => {
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "IFRAME", "TEMPLATE"]);
  const lines = [];
  const stack = document.body ? [document.body] : [];
  // Depth-first, in document order, without recursion.
  while (stack.length) {
    const node = stack.pop();
    if (node.nodeType === 3) {
      const t = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length > 1) lines.push(t);
      continue;
    }
    if (node.nodeType !== 1 || skip.has(node.tagName.toUpperCase())) continue;
    const cs = getComputedStyle(node);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]);
  }
  const seen = new Set();
  const text = lines.filter((l) => (seen.has(l) ? false : (seen.add(l), true))).join("\n");
  const links = Array.from(document.querySelectorAll("a[href]")).map((a) => a.href);
  return { title: document.title, text, links };
})()`;

/** Scroll through once so lazy images and sections load, then return to the top. */
const SCROLL = String.raw`(async () => {
  const step = Math.max(400, window.innerHeight * 0.8);
  for (let y = 0, n = 0; y < document.documentElement.scrollHeight && n < 30; y += step, n++) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 150));
  }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 300));
})()`;

type Readable = { title: string; text: string; links: string[] };

/** Pages worth reading first when there is only time for a few. */
const USEFUL = /about|contact|price|pricing|product|shop|service|menu|faq|deliver|shipping|return|refund|polic|order|categor|collection/i;
const SKIP = /\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4)$|\/(cart|checkout|login|signin|register|account|wishlist|admin)(\/|$)|#/i;

export async function renderSite(input: string, opts: { extraPages?: number; budgetMs?: number } = {}): Promise<Rendered> {
  const start = await assertPublicUrl(input);
  const deadline = Date.now() + (opts.budgetMs ?? 75_000);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-IN,en;q=0.9" });
    // The browser must not be steered at this server's own network, and has no use for video.
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      try {
        const u = new URL(req.url());
        const host = u.hostname.replace(/^\[|\]$/g, "");
        const bad = (u.protocol !== "http:" && u.protocol !== "https:" && u.protocol !== "data:" && u.protocol !== "blob:") || host === "localhost" || /\.(local|internal|localhost)$/i.test(host) || (isIP(host) !== 0 && isPrivateAddress(host));
        if (bad || req.resourceType() === "media") void req.abort();
        else void req.continue();
      } catch {
        void req.abort();
      }
    });
    page.on("dialog", (d) => void d.dismiss().catch(() => {}));

    const open = async (url: string, settleMs: number) => {
      // A page that never goes quiet (chat widgets, analytics) is still usable once it has loaded.
      await page.goto(url, { waitUntil: "networkidle2", timeout: Math.max(5_000, Math.min(25_000, deadline - Date.now())) }).catch(() => {});
      await new Promise((r) => setTimeout(r, settleMs));
    };

    await open(start.toString(), 800);
    await page.evaluate(SCROLL).catch(() => {});
    const finalUrl = page.url();
    await assertPublicUrl(finalUrl);
    const home = (await page.evaluate(READABLE)) as Readable;
    const html = (await page.evaluate(SERIALIZE)) as string;
    const pages: RenderedPage[] = [{ url: finalUrl, title: home.title, text: home.text.slice(0, 40_000) }];

    // A few of the site's own pages, the most useful-looking first.
    const origin = new URL(finalUrl).origin;
    const candidates = [...new Set(home.links.map((l) => l.split("#")[0]!).filter((l) => l.startsWith(origin) && l !== finalUrl && l !== origin + "/" && !SKIP.test(l)))].sort((a, b) => Number(USEFUL.test(b)) - Number(USEFUL.test(a)));
    for (const link of candidates.slice(0, opts.extraPages ?? 6)) {
      if (deadline - Date.now() < 8_000) break;
      try {
        await open(link, 400);
        if (!page.url().startsWith(origin)) continue;
        const r = (await page.evaluate(READABLE)) as Readable;
        if (r.text.length > 120) pages.push({ url: page.url(), title: r.title, text: r.text.slice(0, 40_000) });
      } catch {
        /* skip a page that won't load */
      }
    }
    return { html, finalUrl, pages };
  } finally {
    await browser.close().catch(() => {});
  }
}

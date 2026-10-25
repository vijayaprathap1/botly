import { parse, type HTMLElement } from "node-html-parser";

export type ExtractedPage = { url: string; title: string; description: string; text: string; links: string[] };

const DROP = "script,style,noscript,svg,iframe,template,button,select,option,input,textarea,canvas,video,audio,picture,[aria-hidden=true],.visually-hidden,.sr-only";

/**
 * Readable text from an HTML page: prefer <main>/<article>, keep block structure as lines.
 * <form> wrappers are kept (only their controls are dropped): price lists and enquiry
 * pages are usually one big form with a quantity box per product.
 */
export function extractPage(html: string, pageUrl: string): ExtractedPage {
  const root = parse(html, { comment: false, blockTextElements: { script: false, style: false, noscript: false, pre: true } });
  const title = (root.querySelector("title")?.text ?? "").replace(/\s+/g, " ").trim();
  const description = (root.querySelector('meta[name="description"]')?.getAttribute("content") ?? "").trim();

  const links: string[] = [];
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (!href) continue;
    try {
      links.push(new URL(href, pageUrl).toString());
    } catch {
      /* ignore bad hrefs */
    }
  }

  const body = root.querySelector("body") ?? root;
  body.querySelectorAll(DROP).forEach((n) => n.remove());
  expandTruncatedLinks(body);
  const category = breadcrumbCategory(body);
  const main = body.querySelector("main") ?? body.querySelector("article") ?? body.querySelector('[role="main"]');
  const pick: HTMLElement = main && main.structuredText.length > 400 ? main : body;
  const text = pick.structuredText
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1)
    .filter((l, i, arr) => l !== arr[i - 1])
    .join("\n");
  return { url: pageUrl, title, description, text: category ? `Category: ${category}\n${text}` : text, links };
}

const ELLIPSIS = /(?:\.{3}|…)\s*$/;

/**
 * Listing pages often cut long names ("A Light in the ...") and keep the full one in the
 * link's title attribute or the image's alt text. Use the full name so the knowledge (and
 * the assistant's replies) never carry the truncated title.
 */
function expandTruncatedLinks(body: HTMLElement) {
  for (const a of body.querySelectorAll("a")) {
    const text = a.text.replace(/\s+/g, " ").trim();
    if (!ELLIPSIS.test(text)) continue;
    const full = (a.getAttribute("title") ?? a.querySelector("img[alt]")?.getAttribute("alt") ?? "").replace(/\s+/g, " ").trim();
    const stem = text.replace(ELLIPSIS, "").trim().toLowerCase();
    if (full && full.length > stem.length && full.toLowerCase().startsWith(stem)) a.set_content(escapeHtml(full));
  }
}

/**
 * "Home > Books > Poetry > A Light in the Attic" → "Books > Poetry > A Light in the Attic".
 * Kept as one "Category:" line at the top of the page text, so a page's genre or category
 * is searchable and stays with the page when it is split into chunks.
 */
function breadcrumbCategory(body: HTMLElement): string {
  const crumb = body.querySelector('.breadcrumb, .breadcrumbs, nav[aria-label="breadcrumb" i], nav[aria-label="Breadcrumb"], [itemtype*="BreadcrumbList"]');
  if (!crumb) return "";
  const items = crumb
    .querySelectorAll("li")
    .map((li) => li.text.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const parts = (items.length ? items : crumb.text.split(/[>›»/]/).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean)).filter(
    (t) => !/^home$/i.test(t) && t.length <= 80,
  );
  crumb.remove();
  return parts.length ? parts.join(" > ").slice(0, 300) : "";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Lines repeated on most pages (menus, footers) are removed from each page and
 * returned once as site-wide text, so the knowledge base doesn't repeat them 40 times.
 */
export function splitBoilerplate(pages: ExtractedPage[], threshold = 0.6): { pages: ExtractedPage[]; siteWide: string } {
  if (pages.length < 4) return { pages, siteWide: "" };
  const freq = new Map<string, number>();
  for (const p of pages) for (const l of new Set(p.text.split("\n"))) freq.set(l, (freq.get(l) ?? 0) + 1);
  const common = new Set([...freq].filter(([, n]) => n / pages.length >= threshold).map(([l]) => l));
  const siteWide = [...common].join("\n");
  return {
    siteWide,
    pages: pages.map((p) => ({ ...p, text: p.text.split("\n").filter((l) => !common.has(l)).join("\n") })),
  };
}

export function htmlToText(html: string): string {
  return parse(`<div>${html}</div>`).structuredText.replace(/\n{3,}/g, "\n\n").trim();
}

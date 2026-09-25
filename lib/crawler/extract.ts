import { parse, type HTMLElement } from "node-html-parser";

export type ExtractedPage = { url: string; title: string; description: string; text: string; links: string[] };

const DROP = "script,style,noscript,svg,iframe,template,form,button,select,canvas,video,audio,picture,[aria-hidden=true],.visually-hidden,.sr-only";

/** Readable text from an HTML page: prefer <main>/<article>, keep block structure as lines. */
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
  const main = body.querySelector("main") ?? body.querySelector("article") ?? body.querySelector('[role="main"]');
  const pick: HTMLElement = main && main.structuredText.length > 400 ? main : body;
  const text = pick.structuredText
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1)
    .filter((l, i, arr) => l !== arr[i - 1])
    .join("\n");
  return { url: pageUrl, title, description, text, links };
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

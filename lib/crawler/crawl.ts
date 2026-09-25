import { extractPage, splitBoilerplate, type ExtractedPage } from "./extract";
import { parseRobots, type Robots } from "./robots";
import { fetchShopifyProducts, type CrawledProduct } from "./shopify";

export type CrawlEvent =
  | { stage: "start"; message: string }
  | { stage: "robots"; message: string }
  | { stage: "sitemap"; message: string; count: number }
  | { stage: "page"; message: string; count: number; total: number }
  | { stage: "skip"; message: string }
  | { stage: "shopify"; message: string; count: number };

export type CrawlResult = { pages: ExtractedPage[]; siteWide: string; products: CrawledProduct[] };

const UA = "Mozilla/5.0 (compatible; BotlyBot/1.0; +https://botly.app/bot)";
const SKIP = /\.(jpe?g|png|gif|webp|svg|ico|pdf|zip|mp4|mp3|css|js|xml|json|woff2?)$|\/(cart|checkout|account|login|register|search|wishlist|cdn-cgi)(\/|$)|\/collections\/[^/]+\/products\//i;

export function normalizeUrl(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchText(url: string, timeoutMs: number, accept = "text/html"): Promise<{ text: string; type: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > 3_000_000) return null;
    return { text: (await res.text()).slice(0, 3_000_000), type, finalUrl: res.url || url };
  } catch {
    return null;
  }
}

async function readSitemaps(urls: string[], host: string, timeoutMs: number, depth = 0): Promise<string[]> {
  const out: string[] = [];
  for (const sm of urls.slice(0, 6)) {
    const r = await fetchText(sm, timeoutMs, "application/xml,text/xml");
    if (!r) continue;
    const locs = [...r.text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1]!.trim());
    if (/<sitemapindex/i.test(r.text) && depth < 1) {
      // Shopify & WordPress split sitemaps by type; pages/products first.
      const sorted = locs.sort((a, b) => Number(/page|product/i.test(b)) - Number(/page|product/i.test(a)));
      out.push(...(await readSitemaps(sorted, host, timeoutMs, depth + 1)));
    } else {
      out.push(...locs.filter((l) => {
        try {
          return new URL(l).host === host;
        } catch {
          return false;
        }
      }));
    }
  }
  return out;
}

/** Crawl a site: robots.txt → sitemap.xml (else follow same-domain links) → up to maxPages pages; Shopify products too. */
export async function crawlSite(
  startUrl: string,
  opts: { maxPages: number; timeoutMs?: number; concurrency?: number },
  onEvent: (e: CrawlEvent) => void,
): Promise<CrawlResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const start = normalizeUrl(startUrl);
  if (!start) throw new Error("Invalid URL");
  const origin = new URL(start).origin;
  const host = new URL(start).host;
  onEvent({ stage: "start", message: `Reading ${origin}` });

  let robots: Robots = parseRobots("");
  const rt = await fetchText(`${origin}/robots.txt`, timeoutMs, "text/plain");
  if (rt && !/html/i.test(rt.type)) robots = parseRobots(rt.text);
  onEvent({ stage: "robots", message: rt ? "robots.txt found and respected" : "No robots.txt (everything allowed)" });

  const sitemapUrls = robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`];
  const fromSitemap = (await readSitemaps(sitemapUrls, host, timeoutMs)).map(normalizeUrl).filter((u): u is string => Boolean(u));
  onEvent({ stage: "sitemap", message: fromSitemap.length ? `Sitemap lists ${fromSitemap.length} pages` : "No sitemap, following links", count: fromSitemap.length });

  // Shopify product catalogue (separate from the page budget).
  const productsPromise = fetchShopifyProducts(origin);

  const queue: string[] = [start, ...fromSitemap.filter((u) => !/\/products\//.test(u) || fromSitemap.length < opts.maxPages)];
  const seen = new Set<string>();
  const pages: ExtractedPage[] = [];
  const follow = fromSitemap.length === 0;

  const next = (): string | null => {
    while (queue.length) {
      const u = queue.shift()!;
      if (seen.has(u)) continue;
      seen.add(u);
      const path = new URL(u).pathname;
      if (SKIP.test(path)) continue;
      if (!robots.isAllowed(path)) {
        onEvent({ stage: "skip", message: `robots.txt disallows ${path}` });
        continue;
      }
      return u;
    }
    return null;
  };

  let inFlight = 0;
  const processUrl = async (u: string) => {
    const r = await fetchText(u, timeoutMs);
    if (!r || !/html/i.test(r.type)) return;
    if (new URL(r.finalUrl).host !== host) return;
    const page = extractPage(r.text, u);
    if (page.text.length < 80 || pages.length >= opts.maxPages) return;
    pages.push(page);
    onEvent({ stage: "page", message: page.title || new URL(u).pathname, count: pages.length, total: opts.maxPages });
    if (follow) {
      for (const l of page.links) {
        const n = normalizeUrl(l);
        if (n && new URL(n).host === host && !seen.has(n)) queue.push(n);
      }
    }
  };
  const worker = async () => {
    while (pages.length < opts.maxPages) {
      const u = next();
      if (!u) {
        if (inFlight === 0) return; // nothing queued and nobody can add more
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      inFlight++;
      try {
        await processUrl(u);
      } finally {
        inFlight--;
      }
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 4 }, worker));

  const products = (await productsPromise) ?? [];
  if (products.length) onEvent({ stage: "shopify", message: `Shopify store: ${products.length} products`, count: products.length });
  const split = splitBoilerplate(pages);
  return { pages: split.pages, siteWide: split.siteWide, products };
}

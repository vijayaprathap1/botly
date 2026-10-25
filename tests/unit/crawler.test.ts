import { describe, expect, it } from "vitest";
import { parseRobots } from "@/lib/crawler/robots";
import { extractPage, splitBoilerplate } from "@/lib/crawler/extract";
import { formatShopifyProduct } from "@/lib/crawler/shopify";
import { crawlSite, normalizeUrl } from "@/lib/crawler/crawl";

describe("robots.txt", () => {
  const r = parseRobots(`
User-agent: *
Disallow: /admin
Disallow: /cart
Allow: /admin/public
Disallow: /*.pdf$
Sitemap: https://shop.example/sitemap.xml

User-agent: Googlebot
Disallow: /
`);
  it("applies the * group with longest match", () => {
    expect(r.isAllowed("/")).toBe(true);
    expect(r.isAllowed("/admin/secret")).toBe(false);
    expect(r.isAllowed("/admin/public/page")).toBe(true);
    expect(r.isAllowed("/files/menu.pdf")).toBe(false);
    expect(r.isAllowed("/files/menu.pdf?x")).toBe(true);
    expect(r.sitemaps).toEqual(["https://shop.example/sitemap.xml"]);
  });
  it("empty Disallow allows all", () => {
    expect(parseRobots("User-agent: *\nDisallow:").isAllowed("/x")).toBe(true);
  });
});

describe("extraction", () => {
  const html = `<html><head><title>Returns | Ananya</title><meta name="description" content="Easy returns"></head>
  <body><nav>Home Shop</nav><main><h1>Returns</h1><p>Free returns within <b>7 days</b>.</p><ul><li>Unused</li><li>Tags intact</li></ul>
  <script>var secret=1</script><p>Contact us on WhatsApp.</p><a href="/policies/shipping#x">Shipping</a></main></body></html>`;
  it("keeps readable text and links, drops scripts", () => {
    const p = extractPage(html, "https://ananya.example/pages/returns");
    expect(p.title).toBe("Returns | Ananya");
    expect(p.text).toContain("Free returns within 7 days.");
    expect(p.text).toContain("Tags intact");
    expect(p.text).not.toContain("secret");
    expect(p.links).toContain("https://ananya.example/policies/shipping#x");
  });
  it("keeps a price list that sits inside a <form>, without its controls", () => {
    const list = `<html><body><main><form><table><tr><td>10 cm Electric Sparklers</td><td>1 Box</td><td>Rs. 30</td><td><input name="q1" value="0"><button>Add</button></td></tr><tr><td>Flower Pots Big</td><td>1 Box</td><td>Rs. 120</td><td><select><option>1</option></select></td></tr></table><textarea>hidden note</textarea></form>${"<p>About our Sivakasi factory outlet and delivery.</p>".repeat(12)}</main></body></html>`;
    const p = extractPage(list, "https://shop.example/price-list");
    expect(p.text).toContain("10 cm Electric Sparklers");
    expect(p.text).toContain("Rs. 120");
    expect(p.text).not.toContain("Add");
    expect(p.text).not.toContain("hidden note");
  });
  it("moves boilerplate lines into site-wide text", () => {
    const mk = (i: number) => ({ url: `u${i}`, title: "", description: "", links: [], text: `Menu\nCall +91 98765 43210\nUnique line ${i}` });
    const s = splitBoilerplate([mk(1), mk(2), mk(3), mk(4)]);
    expect(s.siteWide).toContain("Call +91 98765 43210");
    expect(s.pages[0]!.text).toBe("Unique line 1");
  });
  it("normalises URLs", () => {
    expect(normalizeUrl("https://a.in/p/?utm=1#top")).toBe("https://a.in/p");
    expect(normalizeUrl("https://books.toscrape.com/index.html")).toBe("https://books.toscrape.com/");
    expect(normalizeUrl("https://books.toscrape.com/")).toBe("https://books.toscrape.com/");
    expect(normalizeUrl("https://books.toscrape.com/catalogue/index.html")).toBe("https://books.toscrape.com/catalogue");
    expect(normalizeUrl("https://a.in/p/?utm_source=newsletter&page=2#x")).toBe("https://a.in/p?page=2");
    expect(normalizeUrl("mailto:x@y.z")).toBeNull();
  });
});

describe("crawler SSRF", () => {
  const pub = async () => ["93.184.216.34"];
  it("does not follow a link that redirects to a metadata address", async () => {
    const seen: string[] = [];
    const html = `<html><head><title>Shop</title></head><body><main><p>${"Fresh sweets from the shop counter. ".repeat(8)}</p><a href="https://shop.example/next">Next</a></main></body></html>`;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const u = String(input);
      seen.push(u);
      if (u.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:\n", { status: 200, headers: { "content-type": "text/plain" } });
      if (u.includes("sitemap") || u.includes("products.json") || u.includes("cart.js")) return new Response("no", { status: 404, headers: { "content-type": "text/plain" } });
      if (u.endsWith("/next")) return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
      if (u.endsWith("/page")) return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      return new Response("no", { status: 404, headers: { "content-type": "text/plain" } });
    }) as typeof fetch;
    const result = await crawlSite("https://shop.example/page", { maxPages: 3, timeoutMs: 2_000, fetchImpl, resolve: pub }, () => {});
    expect(seen.some((u) => u.includes("169.254") || u.includes("metadata"))).toBe(false);
    expect(result.pages.map((p) => p.url)).toEqual(["https://shop.example/page"]);
  });

  it("refuses a start URL on a private address", async () => {
    await expect(crawlSite("http://127.0.0.1/secret", { maxPages: 1, timeoutMs: 1_000 }, () => {})).rejects.toThrow(/public internet|localhost|address/i);
  });
});

describe("shopify products", () => {
  it("formats price range, options and stock", () => {
    const p = formatShopifyProduct(
      {
        title: "Kanchi Silk",
        handle: "kanchi-silk",
        body_html: "<p>Pure <b>silk</b></p>",
        options: [{ name: "Blouse size", values: ["32", "34", "36"] }],
        variants: [{ price: "12500.00", available: true }, { price: "13000.00", available: false }],
      },
      "https://ananya.example",
      "INR",
    );
    expect(p.url).toBe("https://ananya.example/products/kanchi-silk");
    expect(p.content).toContain("Price: ₹12,500 – ₹13,000");
    expect(p.content).toContain("Blouse size: 32, 34, 36");
    expect(p.content).toContain("Availability: some options in stock");
    expect(p.content).toContain("Description: Pure silk");
  });
});

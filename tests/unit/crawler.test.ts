import { describe, expect, it } from "vitest";
import { parseRobots } from "@/lib/crawler/robots";
import { extractPage, splitBoilerplate } from "@/lib/crawler/extract";
import { formatShopifyProduct } from "@/lib/crawler/shopify";
import { normalizeUrl } from "@/lib/crawler/crawl";

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
  it("moves boilerplate lines into site-wide text", () => {
    const mk = (i: number) => ({ url: `u${i}`, title: "", description: "", links: [], text: `Menu\nCall +91 98765 43210\nUnique line ${i}` });
    const s = splitBoilerplate([mk(1), mk(2), mk(3), mk(4)]);
    expect(s.siteWide).toContain("Call +91 98765 43210");
    expect(s.pages[0]!.text).toBe("Unique line 1");
  });
  it("normalises URLs", () => {
    expect(normalizeUrl("https://a.in/p/?utm=1#top")).toBe("https://a.in/p");
    expect(normalizeUrl("mailto:x@y.z")).toBeNull();
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

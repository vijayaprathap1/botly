import { describe, expect, it } from "vitest";
import { extractPage } from "@/lib/crawler/extract";

/** QA retest 2026-10-25, items 2 and 4: books.toscrape listing + product page structure. */
const LISTING = `<!doctype html><html><head><title>Philosophy | Books to Scrape - Sandbox</title></head><body>
<header><a href="/">Books to Scrape</a></header>
<div class="page_inner"><ul class="breadcrumb"><li><a href="../../../../index.html">Home</a></li><li><a href="../books_1/index.html">Books</a></li><li class="active">Philosophy</li></ul>
<div class="page-header"><h1>Philosophy</h1></div>
<ol class="row">
<li><article class="product_pod"><div class="image_container"><a href="../../../a-light_1000/index.html"><img src="x.jpg" alt="A Light in the Attic" class="thumbnail"></a></div>
<h3><a href="../../../a-light_1000/index.html" title="A Light in the Attic">A Light in the ...</a></h3><div class="product_price"><p class="price_color">£51.77</p></div></article></li>
<li><article class="product_pod"><h3><a href="../../../sophies-world_966/index.html" title="Sophie&#39;s World">Sophie&#39;s World</a></h3><p class="price_color">£15.94</p></article></li>
<li><article class="product_pod"><h3><a href="../../../x/index.html" title="Unrelated">Something else ...</a></h3></article></li>
</ol></div></body></html>`;

const PRODUCT = `<html><head><title>A Light in the Attic | Books to Scrape - Sandbox</title></head><body>
<ul class="breadcrumb"><li><a href="../../index.html">Home</a></li><li><a href="../category/books_1/index.html">Books</a></li><li><a href="../category/books/poetry_23/index.html">Poetry</a></li><li class="active">A Light in the Attic</li></ul>
<div class="product_main"><h1>A Light in the Attic</h1><p class="price_color">£51.77</p><p class="instock availability">In stock (22 available)</p></div></body></html>`;

describe("crawler: full titles and category metadata", () => {
  it("replaces a truncated link text with the full title attribute", () => {
    const p = extractPage(LISTING, "https://books.toscrape.com/catalogue/category/books/philosophy_7/index.html");
    expect(p.text).toContain("A Light in the Attic");
    expect(p.text).not.toContain("A Light in the ...");
    expect(p.text).toContain("Sophie's World");
    // A title that is not the same name is left alone.
    expect(p.text).toContain("Something else ...");
  });
  it("puts the breadcrumb category on the first line of the page text", () => {
    const listing = extractPage(LISTING, "https://books.toscrape.com/catalogue/category/books/philosophy_7/index.html");
    expect(listing.text.split("\n")[0]).toBe("Category: Books > Philosophy");
    const product = extractPage(PRODUCT, "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html");
    expect(product.text.split("\n")[0]).toBe("Category: Books > Poetry > A Light in the Attic");
    expect(product.text).toContain("£51.77");
    // The breadcrumb is not repeated as loose lines.
    expect(product.text.split("\n").filter((l) => l === "Poetry")).toHaveLength(0);
  });
  it("leaves pages without breadcrumbs unchanged", () => {
    const p = extractPage("<html><body><main><p>Open 10am to 8pm every day except Tuesday, near the bus stand. Call us for bulk orders and custom stitching. We ship across India in 3 to 5 working days.</p></main></body></html>", "https://x.in/");
    expect(p.text.startsWith("Category:")).toBe(false);
  });
});


import { chunkSource } from "@/lib/retrieval/chunk";

describe("chunking keeps category metadata searchable", () => {
  it("repeats the Category line in every chunk header", () => {
    const content = ["Category: Books > Philosophy", ...Array.from({ length: 80 }, (_, i) => `Book number ${i} with a fairly long title | £${i}.99`)].join("\n");
    const chunks = chunkSource({ type: "page", title: "Philosophy | Books to Scrape", content }, 120);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.content.split("\n").slice(0, 2)).toEqual(["[page] Philosophy | Books to Scrape", "Category: Books > Philosophy"]);
  });
});

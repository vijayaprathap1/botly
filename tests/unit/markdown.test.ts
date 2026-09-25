import { describe, expect, it } from "vitest";
import { parseMarkdownLite, safeHref, toSafeHtml } from "@/widget/src/markdown";

const html = (s: string) => toSafeHtml(parseMarkdownLite(s));

describe("markdown-lite", () => {
  it("bold, paragraphs and line breaks", () => {
    expect(html("Hello **Priya**\nsecond line\n\nNew para")).toBe(
      "<p>Hello <strong>Priya</strong><br>second line</p><p>New para</p>",
    );
  });
  it("lists", () => {
    expect(html("Options:\n- Silk ₹12,500\n- Cotton ₹1,850\n\n1. one\n2. two")).toBe(
      "<p>Options:</p><ul><li>Silk ₹12,500</li><li>Cotton ₹1,850</li></ul><ol><li>one</li><li>two</li></ol>",
    );
  });
  it("links open in a new tab and only safe schemes are linked", () => {
    expect(html("[Shop](https://a.in/p?x=1)")).toBe(
      '<p><a href="https://a.in/p?x=1" target="_blank" rel="noopener noreferrer nofollow">Shop</a></p>',
    );
    expect(html("[click](javascript:alert(1))")).toBe("<p>click</p>");
    expect(html("[x](data:text/html,<b>)")).toBe("<p>x</p>");
    expect(safeHref("tel:+919876543210")).toBe("tel:+919876543210");
  });
  it("autolinks bare URLs without trailing punctuation", () => {
    expect(html("See https://a.in/returns.")).toBe(
      '<p>See <a href="https://a.in/returns" target="_blank" rel="noopener noreferrer nofollow">https://a.in/returns</a>.</p>',
    );
  });
  it("never passes raw HTML through", () => {
    const out = html('<img src=x onerror="alert(1)"> <script>alert(1)</script> **<b>hi</b>**');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(out).toContain("<strong>&lt;b&gt;hi&lt;/b&gt;</strong>");
  });
  it("headings degrade to bold", () => {
    expect(html("## Delivery")).toBe("<p><strong>Delivery</strong></p>");
  });
  it("unclosed bold during streaming stays literal", () => {
    expect(html("Price is **₹1,8")).toBe("<p>Price is **₹1,8</p>");
  });
});

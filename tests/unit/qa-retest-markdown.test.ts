import { describe, expect, it } from "vitest";
import { parseMarkdownLite, streamSafe, toSafeHtml } from "@/widget/src/markdown";

/** QA retest 2026-10-25, item 4: no raw asterisks in widget replies. */
const html = (s: string) => toSafeHtml(parseMarkdownLite(s));

describe("widget markdown: italic and asterisks", () => {
  it("renders *italic* and _italic_ titles without the markers", () => {
    expect(html("Try *A Light in the Attic* (£51.77).")).toBe("<p>Try <em>A Light in the Attic</em> (£51.77).</p>");
    expect(html("_Sharp Objects_ is £47.82")).toBe("<p><em>Sharp Objects</em> is £47.82</p>");
    expect(html("**Mystery**: *Sharp Objects* £47.82")).toBe("<p><strong>Mystery</strong>: <em>Sharp Objects</em> £47.82</p>");
  });
  it("lists with bold and italic items", () => {
    expect(html("- **Sharp Objects** – £47.82\n- *The Secret Garden* – £15.08")).toBe(
      "<ul><li><strong>Sharp Objects</strong> – £47.82</li><li><em>The Secret Garden</em> – £15.08</li></ul>",
    );
  });
  it("leaves arithmetic, snake_case and lone stars literal", () => {
    expect(html("2 * 3 = 6")).toBe("<p>2 * 3 = 6</p>");
    expect(html("order_id and file_name")).toBe("<p>order_id and file_name</p>");
    expect(html("Rated 5* by readers")).toBe("<p>Rated 5* by readers</p>");
  });
  it("escapes HTML inside emphasis", () => {
    expect(html("*<img src=x onerror=alert(1)>*")).toBe("<p><em>&lt;img src=x onerror=alert(1)&gt;</em></p>");
  });
  it("hides unfinished markers while streaming", () => {
    expect(html(streamSafe("Try *A Light in"))).toBe("<p>Try A Light in</p>");
    expect(html(streamSafe("Try **Sharp Obj"))).toBe("<p>Try <strong>Sharp Obj</strong></p>");
    expect(html(streamSafe("Try *A Light in the Attic* now"))).toBe("<p>Try <em>A Light in the Attic</em> now</p>");
    expect(streamSafe("2 * 3")).toBe("2 * 3");
  });
});

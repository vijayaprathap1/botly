import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let path = "/";
vi.mock("next/navigation", () => ({ usePathname: () => path }));

describe("SiteWidget", () => {
  it("loads Botly's widget once on site pages and not on /t/ test links", async () => {
    const { SiteWidget } = await import("@/components/site-widget");
    path = "/pricing";
    expect(renderToStaticMarkup(createElement(SiteWidget)).match(/widget\.js/g)).toHaveLength(1);
    path = "/t/abc123";
    expect(renderToStaticMarkup(createElement(SiteWidget))).toBe("");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { installGuides } from "@/lib/dashboard";
import { isOriginAllowed, requestOrigin } from "@/lib/security/origin";
import { resolveAccess } from "@/lib/chat/access";
import { devHint, warnOnce } from "@/widget/src/api";
import { findScript, keyOf } from "@/widget/src/locate";

const req = (headers: Record<string, string>, url = "https://botly.in/api/widget/config?key=pk_x") => new Request(url, { headers });

describe("page origin for widget requests", () => {
  it("uses the Origin header when the browser sends it", () => {
    expect(requestOrigin(req({ origin: "https://shop.com", referer: "https://other.com/" }))).toBe("https://shop.com");
  });

  it("same-origin GET without Origin (botly.in's own widget) falls back to the Referer's origin", () => {
    expect(requestOrigin(req({ referer: "https://botly.in/pricing?x=1" }))).toBe("https://botly.in");
    expect(requestOrigin(req({ referer: "https://botly.in" }))).toBe("https://botly.in");
  });

  it("no header, an empty one or 'null' gives no origin (no Host or Sec-Fetch guessing)", () => {
    expect(requestOrigin(req({ origin: "null", referer: "https://botly.in/" }))).toBeNull();
    expect(requestOrigin(req({ "sec-fetch-site": "same-origin", host: "botly.in" }))).toBeNull();
    expect(requestOrigin(req({ referer: "" }))).toBeNull();
    expect(requestOrigin(req({}))).toBeNull();
    expect(requestOrigin(req({ referer: "android-app://x" }))).toBeNull();
  });

  it("a test token still works without an origin (test links, dashboard preview); a page does not", () => {
    const bot = { test_token: "tt_abcdefghijklmnopqrstuvwxyz", allowed_origins: ["shop.com"], active: true, status: "draft" as const };
    expect(resolveAccess(bot, null, "tt_abcdefghijklmnopqrstuvwxyz")).toEqual({ allowed: true, isTest: true });
    expect(resolveAccess(bot, null, "tt_wrongwrongwrongwrongwrong!")).toEqual({ allowed: false, reason: "bad_token" });
    expect(resolveAccess(bot, null, null)).toEqual({ allowed: false, reason: "origin" });
    expect(resolveAccess({ ...bot, status: "live" }, "https://evil.com", null)).toEqual({ allowed: false, reason: "origin" });
  });

  it("the botly.in bot is allowed on its own site again", () => {
    const bot = { test_token: "tt_x", allowed_origins: ["botly.in", "https://botly.in"], active: true, status: "live" as const };
    expect(resolveAccess(bot, requestOrigin(req({ referer: "https://botly.in/" })), null).allowed).toBe(true);
    expect(resolveAccess(bot, requestOrigin(req({ referer: "https://www.botly.in/" })), null).allowed).toBe(true);
    expect(resolveAccess(bot, null, null)).toEqual({ allowed: false, reason: "origin" });
  });
});

describe("allowed-domain entries the way people type them", () => {
  it("an empty list allows nothing", () => {
    expect(isOriginAllowed("https://shop.com", [])).toBe(false);
    expect(isOriginAllowed(null, ["shop.com"])).toBe(false);
    expect(isOriginAllowed("null", ["shop.com"])).toBe(false);
  });

  it.each([
    ["https://botly.in/", "https://botly.in", true],
    ["https://botly.in/pricing", "https://www.botly.in", true],
    ["botly.in/", "http://botly.in:8080", true],
    ["www.botly.in", "https://botly.in", true],
    ["https://www.botly.in", "https://botly.in", true],
    ["https://botly.in?x=1", "https://botly.in", true],
    ["  Botly.IN  ", "https://botly.in", true],
    ["botly.in", "https://notbotly.in", false],
    ["botly.in", "https://botly.in.evil.io", false],
    ["botly.in", "https://app.botly.in", false],
    ["*.botly.in", "https://app.botly.in", true],
    ["*", "https://any.site", false],
    ["*.com", "https://any.com", false],
    ["*.shop.com", "https://shop.com", false], // a wildcard is subdomains only
    ["*.shop.com", "https://a.b.shop.com", true],
    ["http://shop.com:8080/x/", "https://www.shop.com", true],
    ["shop.com:443", "http://shop.com:3000", true],
    ["localhost", "http://localhost:5173", true],
    ["", "https://shop.com", false],
  ])("%s allows %s → %s", (entry, origin, ok) => {
    expect(isOriginAllowed(origin, [entry])).toBe(ok);
  });
});

/** A tiny stand-in for document: just what findScript reads. */
function fakeDoc(current: unknown, scripts: unknown[]) {
  return { currentScript: current, querySelectorAll: () => scripts } as unknown as Document;
}
const tag = (data: Record<string, string>) => ({ tagName: "SCRIPT", dataset: data }) as unknown as HTMLScriptElement;

describe("finding the script tag and key", () => {
  it("prefers document.currentScript", () => {
    const own = tag({ key: "pk_own" });
    expect(findScript(fakeDoc(own, [tag({ key: "pk_other" })]))).toBe(own);
  });

  it("falls back to a widget.js tag when currentScript is null (module, tag manager, late run)", () => {
    const t = tag({ key: "pk_late" });
    expect(findScript(fakeDoc(null, [tag({}), t]))).toBe(t);
  });

  it("accepts data-bot-key as an alias and trims", () => {
    expect(keyOf(tag({ botKey: "  pk_alias " }))).toBe("pk_alias");
    expect(findScript(fakeDoc(null, [tag({})]))).toBeNull();
  });
});

describe("why the widget is not showing", () => {
  afterEach(() => vi.restoreAllMocks());

  it("warns once per reason, on any site", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    devHint("origin", "https://shop.example");
    devHint("origin", "https://shop.example");
    devHint("not_live", "https://shop.example");
    devHint("inactive", "https://shop.example");
    warnOnce("network-test", "[Botly] blocked");
    warnOnce("network-test", "[Botly] blocked");
    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn.mock.calls[0]![0]).toBe("[Botly] This domain isn't allowed (https://shop.example). Add shop.example in Botly → Settings → Allowed domains.");
    expect(warn.mock.calls[1]![0]).toMatch(/draft/);
    expect(warn.mock.calls[2]![0]).toMatch(/switched off/);
  });
});

describe("install guides", () => {
  it("has HTML, React, Next.js and WordPress code with the bot's key", () => {
    const g = installGuides("https://botly.in", "pk_test123");
    expect(g.map((x) => x.id)).toEqual(["html", "react", "next", "wordpress"]);
    for (const x of g) expect(x.code).toContain("pk_test123");
    expect(g.find((x) => x.id === "next")!.code).toContain('strategy="afterInteractive"');
    expect(g.find((x) => x.id === "react")!.code).toContain("useEffect");
  });
});

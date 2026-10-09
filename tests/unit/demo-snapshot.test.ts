import { readFileSync } from "node:fs";
import { parse } from "node-html-parser";
import { describe, expect, it } from "vitest";
import { absoluteCss, cleanSnapshot, looksBlocked, needsRendering, ORIGIN_TOKEN, pickBrandColor, pickBusinessName, SnapshotError } from "@/lib/demo/snapshot";
import { assertPublicUrl, isPrivateAddress, parsePublicUrl, safeFetch, UnsafeUrlError } from "@/lib/demo/url-guard";

const fixture = readFileSync("tests/fixtures/demo/aggressive.html", "utf8");
const BASE = "https://lakshmisweets.example/";
const snap = () => cleanSnapshot({ html: fixture, finalUrl: BASE, businessName: "Lakshmi <Sweets>", slug: "s".repeat(32), publicKey: "pk_demo_key_0001", testToken: "tt_demo_token_0001" });

describe("demo snapshot: clean-up", () => {
  const out = snap();
  const doc = parse(out.html, { blockTextElements: { script: true, style: true } });

  it("leaves only Botly's two scripts", () => {
    const scripts = doc.querySelectorAll("script");
    expect(scripts.map((s) => s.getAttribute("src"))).toEqual([`${ORIGIN_TOKEN}/demo-bar.js`, `${ORIGIN_TOKEN}/widget.js`]);
    expect(scripts.every((s) => !s.text.trim())).toBe(true);
    expect(out.html).not.toContain("__fixtureRan");
    expect(out.html).not.toContain("__svgRan");
    expect(out.removed.scripts).toBe(4);
  });

  it("removes handlers, javascript: links, frames, plugins and password fields", () => {
    expect(out.html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(out.html).not.toMatch(/javascript:/i);
    for (const sel of ["iframe", "object", "embed", "noscript", 'input[type="password"]', "[formaction]"]) expect(doc.querySelectorAll(sel)).toHaveLength(0);
    expect(out.html).not.toContain("behavior:");
  });

  it("removes other chat widgets, floating WhatsApp buttons and pop-ups", () => {
    for (const t of ["Chat with us", "whatsapp-float", "We use cookies", "Subscribe!"]) expect(out.html).not.toContain(t);
    expect(out.removed.widgets).toBe(4);
  });

  it("points every asset at their own site", () => {
    expect(doc.querySelector('img[alt="Laddu"]')!.getAttribute("src")).toBe(BASE + "img/laddu.jpg");
    expect(doc.querySelector('img[alt="Laddu"]')!.getAttribute("srcset")).toBe(`${BASE}img/laddu.jpg 1x, ${BASE}img/laddu@2x.jpg 2x`);
    expect(doc.querySelectorAll('link[rel="stylesheet"]').map((l) => l.getAttribute("href"))).toEqual(expect.arrayContaining([BASE + "css/site.css", BASE + "css/deferred.css", BASE + "css/late.css", BASE + "css/print-trick.css"]));
    expect(doc.querySelector('link[href$="print-trick.css"]')!.getAttribute("media")).toBe("all");
    expect(out.html).toContain(`url('${BASE}img/hero.jpg')`);
    expect(out.html).toContain(`url(${BASE}img/header.png)`);
    expect(out.html).toContain(`@import "${BASE}fonts/font.css"`);
  });

  it("promotes lazy images", () => {
    const m = doc.querySelector('img[alt="Murukku"]')!;
    expect(m.getAttribute("src")).toBe(BASE + "img/murukku.jpg");
    expect(m.getAttribute("srcset")).toBe(`${BASE}img/murukku-600.jpg 600w, ${BASE}img/murukku-1200.jpg 1200w`);
    expect(doc.querySelector('img[alt="Gift box"]')!.getAttribute("src")).toBe(BASE + "img/box.jpg");
    expect(doc.querySelector("source")!.getAttribute("srcset")).toBe(BASE + "img/box.webp");
  });

  it("puts our base, title and robots first and drops theirs", () => {
    const head = doc.querySelector("head")!;
    expect(head.firstChild!.toString()).toBe(`<base href="${BASE}">`);
    expect(doc.querySelectorAll("base")).toHaveLength(1);
    expect(out.html).toContain("<title>Preview · Lakshmi &lt;Sweets&gt;</title>");
    expect(doc.querySelectorAll("title")).toHaveLength(1);
    expect(doc.querySelector('meta[name="robots"]')!.getAttribute("content")).toBe("noindex,nofollow,noarchive");
    for (const sel of ['meta[http-equiv="refresh"]', 'meta[http-equiv="Content-Security-Policy"]', 'link[rel="canonical"]', 'link[rel="manifest"]', 'meta[property^="og:"]', 'meta[name^="twitter:"]']) expect(doc.querySelectorAll(sel)).toHaveLength(0);
  });

  it("neutralises forms and shop links, opens their links in a new tab, keeps in-page links", () => {
    const form = doc.querySelector("form")!;
    expect(form.getAttribute("action")).toBe("about:blank");
    expect(form.hasAttribute("data-botly-demo-disabled")).toBe(true);
    const link = (text: string) => doc.querySelectorAll("a").find((a) => a.text.trim() === text)!;
    expect(link("Cart").getAttribute("href")).toBe("#");
    expect(link("Sign in").hasAttribute("data-botly-demo-disabled")).toBe(true);
    expect(link("Menu").getAttribute("href")).toBe(BASE + "menu");
    expect(link("Menu").getAttribute("target")).toBe("_blank");
    expect(link("Contact").getAttribute("data-botly-demo-hash")).toBe("#contact");
    expect(link("Bad").getAttribute("href")).toBeUndefined();
    expect(link("Mail us").getAttribute("href")).toBe("mailto:hello@lakshmisweets.example");
  });

  it("adds the bar and the widget on the test-token path, and picks the brand colour", () => {
    const bar = doc.querySelector("#botly-demo-bar")!;
    expect(bar.getAttribute("data-business")).toBe("Lakshmi <Sweets>");
    const widget = doc.querySelector(`script[src="${ORIGIN_TOKEN}/widget.js"]`)!;
    expect(widget.getAttribute("data-key")).toBe("pk_demo_key_0001");
    expect(widget.getAttribute("data-test-token")).toBe("tt_demo_token_0001");
    expect(out.color).toBe("#b45309");
    expect(out.bytes).toBe(Buffer.byteLength(out.html));
  });
});

describe("demo snapshot: helpers", () => {
  it("picks a colour: theme-color, then buttons, never a grey", () => {
    expect(pickBrandColor(parse('<meta name="theme-color" content="#0a7">'))).toBe("#00aa77");
    expect(pickBrandColor(parse("<style>.btn{background:#e11d48}.btn-2{background-color:#e11d48}a.button{background:#111111}</style>", { blockTextElements: { style: true } }))).toBe("#e11d48");
    expect(pickBrandColor(parse('<meta name="theme-color" content="#ffffff">'))).toBe("#4f46e5");
  });
  it("picks the business name from og:site_name or the title", () => {
    expect(pickBusinessName(fixture, BASE)).toBe("Lakshmi Sweets");
    expect(pickBusinessName("<title>Home | Sri Krishna Dental</title>", "https://skdental.example/")).toBe("Sri Krishna Dental");
    expect(pickBusinessName("<title></title>", "https://www.kovaicrackers.example/")).toBe("Kovaicrackers");
  });
  it("recognises a bot check and a page that needs a browser", () => {
    expect(looksBlocked(403, "")).toBe(true);
    expect(looksBlocked(200, "<title>Just a moment...</title><div id='cf-chl-widget'></div>")).toBe(true);
    expect(looksBlocked(200, fixture)).toBe(false);
    expect(needsRendering('<html><body><div id="root"></div><script src="/app.js"></script></body></html>')).toBe(true);
    expect(needsRendering(`<html><body><main>${"Sweets and snacks made fresh. ".repeat(20)}</main></body></html>`)).toBe(false);
  });
  it("rewrites CSS urls and leaves data: alone", () => {
    expect(absoluteCss("a{background:url(x.png)}b{background:url(data:image/png;base64,AA)}", BASE)).toBe(`a{background:url(${BASE}x.png)}b{background:url(data:image/png;base64,AA)}`);
  });
  it("refuses a page with no body and one that is too large", () => {
    expect(() => cleanSnapshot({ html: "<p>hi</p>", finalUrl: BASE, businessName: "X", slug: "s".repeat(32), publicKey: "pk_demo_key_0001", testToken: "tt_x" })).toThrow(SnapshotError);
    const big = `<html><head></head><body><p>${"word ".repeat(420_000)}</p></body></html>`;
    expect(() => cleanSnapshot({ html: big, finalUrl: BASE, businessName: "X", slug: "s".repeat(32), publicKey: "pk_demo_key_0001", testToken: "tt_x" })).toThrow(/too large/);
  });
});

describe("url guard", () => {
  const pub = async () => ["93.184.216.34"];
  it("knows private, loopback and link-local addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.4", "172.31.255.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fd12::3", "fe80::1", "::ffff:10.0.0.1", "224.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it("accepts public http(s) and adds https:// when missing", async () => {
    expect((await assertPublicUrl("shop.example.com/path#x", pub)).toString()).toBe("https://shop.example.com/path");
    expect((await assertPublicUrl("http://shop.example.com", pub)).protocol).toBe("http:");
  });
  it("rejects other schemes, credentials, odd ports, local names and private IPs", () => {
    for (const u of ["file:///etc/passwd", "ftp://shop.example.com", "http://127.0.0.1", "http://10.0.0.5/x", "http://[::1]/", "http://localhost:3000", "http://printer.local", "https://user:pw@shop.example.com", "https://shop.example.com:8443", "http://intranet", ""]) {
      expect(() => parsePublicUrl(u), u).toThrow(UnsafeUrlError);
    }
  });
  it("rejects a hostname that resolves to a private address, and one that doesn't resolve", async () => {
    await expect(assertPublicUrl("https://rebind.example.com", async () => ["93.184.216.34", "10.0.0.7"])).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicUrl("https://nope.example.com", async () => { throw new Error("ENOTFOUND"); })).rejects.toThrow(/couldn't find/);
  });
  it("re-checks every redirect and caps the body size", async () => {
    const hops: string[] = [];
    const fetchImpl = (async (u: URL | string) => {
      hops.push(String(u));
      if (String(u).includes("start")) return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
      return new Response("x");
    }) as typeof fetch;
    await expect(safeFetch("https://start.example.com", { fetchImpl, resolve: pub })).rejects.toThrow(UnsafeUrlError);
    expect(hops).toEqual(["https://start.example.com/"]);
    const big = (async () => new Response("y".repeat(5000))) as unknown as typeof fetch;
    await expect(safeFetch("https://big.example.com", { fetchImpl: big, resolve: pub, maxBytes: 1000 })).rejects.toThrow(/too large/);
    const ok = (async () => new Response("<html>ok</html>", { headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    expect((await safeFetch("https://ok.example.com", { fetchImpl: ok, resolve: pub })).body).toBe("<html>ok</html>");
  });
});

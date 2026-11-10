import { describe, expect, it } from "vitest";
import { isOriginAllowed, normalizeOrigin } from "@/lib/security/origin";
import { widgetDisabledWarning } from "@/widget/src/api";

describe("origin check", () => {
  const allowed = ["https://ananya.in", "shop.example.com", "*.myshopify.com", "http://localhost:3000"];

  it("normalises", () => {
    expect(normalizeOrigin("HTTPS://Ananya.in/")).toBe("https://ananya.in");
    expect(normalizeOrigin("null")).toBeNull();
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin(undefined)).toBeNull();
  });

  it.each([
    ["https://ananya.in", true],
    ["http://ananya.in", true], // scheme in the entry is ignored
    ["https://www.ananya.in", true], // www twin is the same site
    ["https://evilananya.in", false],
    ["https://ananya.in.evil.io", false],
    ["https://shop.ananya.in", false], // other subdomains need a *. entry
    ["https://shop.example.com", true],
    ["http://shop.example.com", true],
    ["https://www.shop.example.com", true],
    ["https://evil-shop.example.com", false],
    ["https://ananya.myshopify.com", true],
    ["https://myshopify.com", false],
    ["https://myshopify.com.evil.io", false],
    ["http://localhost:3000", true],
    ["http://localhost:3001", true], // port in the entry is ignored
    [null, false],
    ["null", false],
  ])("%s → %s", (origin, ok) => {
    expect(isOriginAllowed(origin, allowed)).toBe(ok);
  });

  it("empty allow-list allows nothing", () => {
    expect(isOriginAllowed("https://ananya.in", [])).toBe(false);
  });

  it("logs one warning when the widget is disabled for the origin", () => {
    expect(widgetDisabledWarning("origin", "http://localhost:8765")).toBe(
      "[Botly] This domain isn't allowed (http://localhost:8765). Add localhost in Botly → Settings → Allowed domains.",
    );
    expect(widgetDisabledWarning("inactive", "http://localhost:8765")).toBeNull();
  });

  it("ports and schemes in entries are ignored; localhost works only when listed", () => {
    expect(isOriginAllowed("http://localhost:8765", ["localhost"])).toBe(true);
    expect(isOriginAllowed("https://localhost", ["localhost"])).toBe(true);
    expect(isOriginAllowed("http://localhost:3000", ["localhost:8765"])).toBe(true);
    expect(isOriginAllowed("https://localhost:8443", ["http://localhost:3000"])).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:8765", ["localhost"])).toBe(false);
    expect(isOriginAllowed("http://127.0.0.1:8765", ["127.0.0.1:5500"])).toBe(true);
    expect(isOriginAllowed("http://localhost:3000", ["botly.in"])).toBe(false);
    expect(isOriginAllowed("http://[::1]:3000", ["[::1]:5000"])).toBe(true);
  });
});

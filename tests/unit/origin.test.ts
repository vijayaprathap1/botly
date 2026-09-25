import { describe, expect, it } from "vitest";
import { isOriginAllowed, normalizeOrigin } from "@/lib/security/origin";

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
    ["http://ananya.in", false], // exact entry includes the scheme
    ["https://www.ananya.in", false],
    ["https://shop.example.com", true],
    ["http://shop.example.com", true],
    ["https://www.shop.example.com", true],
    ["https://evil-shop.example.com", false],
    ["https://ananya.myshopify.com", true],
    ["https://myshopify.com", false],
    ["https://myshopify.com.evil.io", false],
    ["http://localhost:3000", true],
    ["http://localhost:3001", false],
    [null, false],
    ["null", false],
  ])("%s → %s", (origin, ok) => {
    expect(isOriginAllowed(origin, allowed)).toBe(ok);
  });

  it("empty allow-list allows nothing", () => {
    expect(isOriginAllowed("https://ananya.in", [])).toBe(false);
  });
});

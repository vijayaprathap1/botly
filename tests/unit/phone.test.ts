import { describe, expect, it } from "vitest";
import { isValidEmail, normalizePhone, whatsappLink } from "@/lib/validation/phone";

describe("normalizePhone", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["98765 43210", "+919876543210"],
    ["098765-43210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["0091 9876543210", "+919876543210"],
    ["(+91) 7000012345", "+917000012345"],
  ])("accepts Indian %s", (input, e164) => {
    const r = normalizePhone(input);
    expect(r.ok && r.e164).toBe(e164);
    expect(r.ok && r.country).toBe("IN");
  });

  it.each([
    ["+971 50 123 4567", "+971501234567"],
    ["+1 (415) 555-0100", "+14155550100"],
    ["0044 20 7946 0958", "+442079460958"],
    ["+65 8123 4567", "+6581234567"],
  ])("accepts international %s", (input, e164) => {
    const r = normalizePhone(input);
    expect(r.ok && r.e164).toBe(e164);
    expect(r.ok && r.country).toBe("INTL");
  });

  it.each(["", "12345", "5876543210", "+91 5876543210", "98765432101", "abc9876543210", "+91+9876543210", "+0123456789", "+1234567", "98765 4321"])(
    "rejects %s",
    (input) => expect(normalizePhone(input).ok).toBe(false),
  );

  it("formats Indian display", () => {
    const r = normalizePhone("9876543210");
    expect(r.ok && r.display).toBe("+91 98765 43210");
  });
});

describe("email + whatsapp", () => {
  it("validates emails", () => {
    expect(isValidEmail("priya@example.in")).toBe(true);
    expect(isValidEmail("priya@example")).toBe(false);
    expect(isValidEmail("<x>@a.com")).toBe(false);
  });
  it("builds wa.me links", () => {
    expect(whatsappLink("+919876543210", "Hi Priya")).toBe("https://wa.me/919876543210?text=Hi%20Priya");
  });
});

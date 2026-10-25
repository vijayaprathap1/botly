import { afterEach, describe, expect, it, vi } from "vitest";
import { business, supportPhoneLinks } from "../../lib/business";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public support phone", () => {
  it("derives the call and WhatsApp links from the display number", () => {
    expect(supportPhoneLinks("+91 90470 51669")).toEqual({
      tel: "+919047051669",
      whatsapp: "https://wa.me/919047051669",
    });
  });

  it("uses the official number unless SUPPORT_PHONE is set", () => {
    vi.stubEnv("SUPPORT_PHONE", "");
    expect(business.phone).toBe("+91 90470 51669");
    expect(business.phoneTel).toBe("+919047051669");
    expect(business.whatsappUrl).toBe("https://wa.me/919047051669");
  });

  it("lets SUPPORT_PHONE override the public number", () => {
    vi.stubEnv("SUPPORT_PHONE", "+91 98000 11111");
    expect(business.phone).toBe("+91 98000 11111");
    expect(business.phoneTel).toBe("+919800011111");
    expect(business.whatsappUrl).toBe("https://wa.me/919800011111");
  });

  it("uses support@botly.in unless SUPPORT_EMAIL is set", () => {
    vi.stubEnv("SUPPORT_EMAIL", "");
    expect(business.email).toBe("support@botly.in");
    vi.stubEnv("SUPPORT_EMAIL", "owner@example.com");
    expect(business.email).toBe("owner@example.com");
  });
});

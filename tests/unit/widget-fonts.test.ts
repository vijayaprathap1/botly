import { describe, expect, it } from "vitest";
import { fontFaces, indicLang, scriptsIn } from "@/widget/src/fonts";
import { contactLinks, maskPhone } from "@/widget/src/widget";

describe("widget script detection (lazy Indic fonts)", () => {
  // TODO: native check pending (Tamil and Hindi sample strings below)
  const TA = "பிளவுஸ் தைக்க ₹650 ஆகும்."; // TODO: native check pending
  const HI = "डिलीवरी में 2–4 दिन लगते हैं।"; // TODO: native check pending

  it("English text needs no Indic font", () => {
    expect(scriptsIn("Is COD available? ₹1,999")).toEqual([]);
    expect(indicLang("Is COD available?")).toBeNull();
    expect(indicLang("")).toBeNull();
  });
  it("detects Tamil and Devanagari, including mixed with Latin", () => {
    expect(scriptsIn(TA)).toEqual(["tamil"]);
    expect(indicLang(`COD ${TA}`)).toBe("ta");
    expect(scriptsIn(HI)).toEqual(["deva"]);
    expect(indicLang(`COD ${HI}`)).toBe("hi");
    expect(scriptsIn(TA + HI)).toEqual(["tamil", "deva"]);
  });
  it("font faces are self-hosted, prefixed, swap, and range-limited", () => {
    const css = fontFaces("https://botly.in", "tamil");
    expect(css).toContain('font-family:"Botly Tamil"');
    expect(css).toContain("https://botly.in/widget-fonts/hind-madurai-tamil-400-normal.woff2");
    expect(css).toContain("font-display:swap");
    expect(css).toContain("unicode-range:U+0964-0965,U+0B82-0BFA");
    expect(fontFaces("https://botly.in", "deva")).toContain("mukta-devanagari-600-normal.woff2");
    expect(fontFaces("https://botly.in", "latin")).toContain('"Botly Jakarta"');
  });
});

describe("handoff links and masked phone", () => {
  it("WhatsApp and Call go to the business's own number in international form", () => {
    expect(contactLinks({ phone: "+91 98765 43210", whatsapp: "+91 98765 43210" })).toEqual({ wa: "https://wa.me/919876543210", tel: "tel:+919876543210" });
    // A bare 10-digit Indian number gets +91 (wa.me/9876543210 would open the wrong country).
    expect(contactLinks({ whatsapp: "98765 43210" }).wa).toBe("https://wa.me/919876543210");
    expect(contactLinks({ phone: "+44 20 7946 0958" }).tel).toBe("tel:+442079460958");
    expect(contactLinks({ email: "hello@shop.example" }).mail).toBe("hello@shop.example");
    expect(contactLinks({ email: "not an email" }).mail).toBeUndefined();
    expect(contactLinks({})).toEqual({});
  });
  it("masks all but the start and the last two digits", () => {
    expect(maskPhone("+91 97900 11223")).toBe("+91 97900 •••23");
    expect(maskPhone("+447911123456")).toBe("+4479111•••56");
  });
});

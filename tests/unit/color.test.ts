import { describe, expect, it } from "vitest";
import { accentText, contrastRatio, DEFAULT_ACCENT, INK, mix, onAccent, readableTextOn, safeColor, SURFACES, themeVars } from "@/widget/src/color";

describe("contrast", () => {
  it("picks readable text", () => {
    expect(readableTextOn("#9f1239")).toBe("#ffffff");
    expect(readableTextOn("#fde047")).toBe("#000000");
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
  });
  it("chosen text always meets 4.5:1 for typical brand colours", () => {
    for (const c of ["#4f46e5", "#9f1239", "#16a34a", "#f59e0b", "#0ea5e9", "#111827", "#ffffff", "#ec4899"]) {
      expect(contrastRatio(c, readableTextOn(c))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("widget theme from one brand colour", () => {
  // Pale, mid-tone, dark and saturated brands, plus a few that fail plain white/black.
  const BRANDS = ["#C2410C", "#4f46e5", "#9f1239", "#7F1D1D", "#0E7490", "#16a34a", "#f59e0b", "#fde047", "#ffffff", "#000000", "#777777", "#ec4899", "#22d3ee", "#a3e635"];

  it("defaults to saffron when the colour is missing or invalid", () => {
    expect(DEFAULT_ACCENT).toBe("#C2410C");
    expect(safeColor(null)).toBe("#C2410C");
    expect(safeColor("not-a-colour")).toBe("#C2410C");
    expect(themeVars(undefined, false)["--p"]).toBe("#C2410C");
    expect(safeColor("9f1239")).toBe("#9f1239");
  });

  it("text on the accent reaches 4.5:1 for every brand", () => {
    for (const c of BRANDS) expect(contrastRatio(c, onAccent(c)), c).toBeGreaterThanOrEqual(4.5);
  });

  it("prefers Botly ink over pure black, and white when it reads better", () => {
    expect(onAccent("#fde047")).toBe(INK);
    expect(onAccent("#C2410C")).toBe("#FFFFFF");
  });

  it("the accent used as text reaches 4.5:1 on both panel surfaces, light and dark", () => {
    for (const c of BRANDS)
      for (const dark of [false, true]) {
        const v = themeVars(c, dark);
        const s = dark ? SURFACES.dark : SURFACES.light;
        expect(contrastRatio(v["--p-text"]!, s.paper), `${c} ${dark}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(v["--p-text"]!, s.bg), `${c} ${dark}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(v["--p"]!, v["--on-p"]!)).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("leaves a dark enough brand untouched as text", () => {
    expect(accentText("#7F1D1D", ["#FFFFFF", "#FFF7EC"], INK)).toBe("#7F1D1D");
  });

  it("mixes in sRGB", () => {
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mix("#FFFFFF", "#C2410C", 0)).toBe("#FFFFFF");
  });
});

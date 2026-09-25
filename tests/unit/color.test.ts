import { describe, expect, it } from "vitest";
import { contrastRatio, readableTextOn } from "@/widget/src/color";

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

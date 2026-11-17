import { describe, expect, it } from "vitest";
import { dayParts, durationText, groupSlots, priceText } from "@/widget/src/booking";

describe("widget booking helpers", () => {
  it("groups times into morning, afternoon and evening", () => {
    const g = groupSlots([{ t: "09:30" }, { t: "11:30" }, { t: "12:00" }, { t: "16:30" }, { t: "17:00" }, { t: "19:30" }]);
    expect(g.map((x) => [x.label, x.items.map((i) => i.t)])).toEqual([
      ["Morning", ["09:30", "11:30"]],
      ["Afternoon", ["12:00", "16:30"]],
      ["Evening", ["17:00", "19:30"]],
    ]);
    expect(groupSlots([{ t: "14:00" }]).map((x) => x.label)).toEqual(["Afternoon"]);
  });
  it("durations and prices read naturally", () => {
    expect(durationText(20)).toBe("20 min");
    expect(durationText(60)).toBe("1 hr");
    expect(durationText(90)).toBe("1 hr 30 min");
    expect(priceText(null)).toBe("");
    expect(priceText(0)).toBe("Free");
    expect(priceText(1500)).toBe("₹1,500");
  });
  it("day chips", () => {
    expect(dayParts("2026-11-18")).toMatchObject({ d: "18", wd: "Wed", mon: "Nov" });
  });
});

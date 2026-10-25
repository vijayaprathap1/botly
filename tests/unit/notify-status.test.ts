import { describe, expect, it } from "vitest";
import { whatsappLeadStatus } from "@/lib/notify/status";

describe("whatsappLeadStatus (QA R20)", () => {
  it("says 'not set up' when WhatsApp Cloud isn't configured or no numbers are saved", () => {
    expect(whatsappLeadStatus(null, ["+919000000000"], false)).toBe("not set up");
    expect(whatsappLeadStatus(null, [], true)).toBe("not set up");
  });
  it("pending only when it can still be sent; sent wins", () => {
    expect(whatsappLeadStatus(null, ["+919000000000"], true)).toBe("pending");
    expect(whatsappLeadStatus("2026-10-25T08:00:00Z", [], false)).toBe("sent");
  });
  it("reads the env when not told", () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    expect(whatsappLeadStatus(null, ["+919000000000"])).toBe("not set up");
  });
});

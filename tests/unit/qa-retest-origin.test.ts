import { afterEach, describe, expect, it, vi } from "vitest";
import { isDevOrigin, isLoopback } from "@/lib/chat/access";
import { devHint, widgetDisabledWarning } from "@/widget/src/api";

/** QA retest 2026-10-25, item 7: blocked-origin console warning for IPs and hostnames, once. */
describe("blocked-origin console hint", () => {
  afterEach(() => vi.restoreAllMocks());

  it("the config route explains itself to developer origins only", () => {
    for (const o of ["http://127.0.0.1:8765", "http://127.0.1.1", "http://[::1]:3000", "http://localhost:8765", "http://shop.localhost:3000", "http://192.168.1.20:8080", "http://10.0.0.5", "http://172.20.1.1", "http://mysite.local", "http://shop.test"])
      expect(isDevOrigin(o), o).toBe(true);
    for (const o of ["https://evil.example", "https://172.32.0.1", "https://8.8.8.8", "https://ananya.in", null, "null"]) expect(isDevOrigin(o), String(o)).toBe(false);
    // Access rules are unchanged: a draft still only works on loopback.
    expect(isLoopback("http://192.168.1.20:8080")).toBe(false);
  });

  it("words the warning for IPs and hostnames", () => {
    expect(widgetDisabledWarning("origin", "http://127.0.0.1:8765")).toBe(
      "[Botly] This address isn't allowed (http://127.0.0.1:8765). Add 127.0.0.1 (or open the page on localhost) in Botly → Settings → Allowed domains.",
    );
    expect(widgetDisabledWarning("origin", "http://mysite.local")).toBe("[Botly] This domain isn't allowed (http://mysite.local). Add mysite.local in Botly → Settings → Allowed domains.");
  });

  it("warns once per page for the same reason and origin", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    devHint("origin", "http://127.0.0.1:9999");
    devHint("origin", "http://127.0.0.1:9999");
    devHint("origin", "http://shop.test:9999");
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]![0]).toMatch(/^\[Botly\] This address isn't allowed/);
    expect(warn.mock.calls[1]![0]).toMatch(/^\[Botly\] This domain isn't allowed/);
  });
});

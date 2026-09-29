import { afterEach, describe, expect, it, vi } from "vitest";
import { alertKey, reportError } from "../../lib/alerts";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("alerts", () => {
  it("groups repeats of the same error despite changing numbers and ids", () => {
    expect(alertKey("AI", "LLM API 429: Used 199990 of 200000")).toBe(alertKey("AI", "LLM API 429: Used 199995 of 200000"));
    expect(alertKey("AI", "bot 3102688e-1ac9-4676-9bf2-00e8619e9f7a failed")).toBe(alertKey("AI", "bot fc885dff-2a9b-4781-9388-ca64ea910d15 failed"));
    expect(alertKey("AI", "timeout")).not.toBe(alertKey("DB", "timeout"));
  });

  it("emails the admin once per 15 minutes per kind of error", async () => {
    vi.stubEnv("ADMIN_EMAILS", "me@shop.test,other@shop.test");
    vi.stubEnv("RESEND_API_KEY", "re_test_key_123");
    vi.stubEnv("BOTLY_TEST_SCRIPTED_LLM", "");
    const sent: { to: string[]; subject: string }[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: "e1" }), { status: 200 });
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await reportError("AI replies failing", new Error("LLM API 503: busy 1"))).toBe(true);
    expect(await reportError("AI replies failing", new Error("LLM API 503: busy 2"))).toBe(false);
    expect(await reportError("Server error", new Error("boom"))).toBe(true);
    spy.mockRestore();
    expect(sent.map((s) => s.to[0])).toEqual(["me@shop.test", "me@shop.test"]);
    expect(sent[0]!.subject).toBe("Botly alert: AI replies failing");
  });
});

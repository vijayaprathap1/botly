import { afterEach, describe, expect, it, vi } from "vitest";

const claims = new Set<string>();
vi.mock("../../lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    rpc: async (_name: string, args: { p_key: string }) => {
      if (claims.has(args.p_key)) return { data: false, error: null };
      claims.add(args.p_key);
      return { data: true, error: null };
    },
  }),
}));

import { alertKey, reportError } from "../../lib/alerts";

afterEach(() => {
  claims.clear();
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

  it("honours a shared claim so a second instance does not email again", async () => {
    vi.stubEnv("ADMIN_EMAILS", "me@shop.test");
    vi.stubEnv("RESEND_API_KEY", "re_test_key_123");
    vi.stubEnv("BOTLY_TEST_SCRIPTED_LLM", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-for-tests-only");
    const sent: string[] = [];
    vi.stubGlobal("fetch", async () => {
      sent.push("email");
      return new Response(JSON.stringify({ id: "e1" }), { status: 200 });
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await reportError("AI budget", new Error("LLM API 429: busy 1"))).toBe(true);
    expect(await reportError("AI budget", new Error("LLM API 429: busy 2"))).toBe(false);
    spy.mockRestore();
    expect(sent).toHaveLength(1);
    expect(claims.size).toBe(1);
  });
});

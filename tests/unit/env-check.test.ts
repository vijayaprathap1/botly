import { describe, expect, it } from "vitest";
import { blockingProblems, checkEnv, featureProblems } from "@/lib/env-check";

const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.sig`;
const good = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"),
  SUPABASE_SERVICE_ROLE_KEY: jwt("service_role"),
  ANTHROPIC_API_KEY: "sk-ant-api03-" + "a".repeat(80),
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  ADMIN_EMAILS: "me@example.com",
  RAZORPAY_KEY_ID: "rzp_test_AbC123",
  RAZORPAY_KEY_SECRET: "secret",
  RAZORPAY_PLAN_STARTER: "plan_Starter1",
  RAZORPAY_PLAN_GROWTH: "plan_Growth1",
  RAZORPAY_WEBHOOK_SECRET: "hook",
};

describe("env check", () => {
  it("accepts a good env (legacy and new Supabase key formats)", () => {
    expect(checkEnv(good)).toEqual([]);
    expect(checkEnv({ ...good, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_abc", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_abc" })).toEqual([]);
  });
  it("catches the README placeholders", () => {
    const names = blockingProblems({
      ...good,
      NEXT_PUBLIC_SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "...",
      SUPABASE_SERVICE_ROLE_KEY: "...",
      ANTHROPIC_API_KEY: "sk-ant-...",
    }).map((p) => p.name);
    expect(names).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  });
  it("catches swapped Supabase keys and a URL with a path", () => {
    const p = checkEnv({ ...good, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("service_role"), SUPABASE_SERVICE_ROLE_KEY: jwt("anon"), NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co/rest/v1" });
    expect(p.map((x) => x.problem)).toEqual(["not a bare URL", "this is the SECRET key", "this is the PUBLIC anon key"]);
  });
  it("missing Anthropic key is a feature problem, not a blocker", () => {
    expect(blockingProblems({ ...good, ANTHROPIC_API_KEY: "sk-ant-..." })).toHaveLength(0);
    expect(featureProblems({ ...good, ANTHROPIC_API_KEY: "sk-ant-..." }).map((p) => p.name)).toEqual(["ANTHROPIC_API_KEY"]);
  });
  it("Resend placeholder is reported but not blocking", () => {
    expect(checkEnv({ ...good, RESEND_API_KEY: "re_..." })).toHaveLength(1);
    expect(blockingProblems({ ...good, RESEND_API_KEY: "re_..." })).toHaveLength(0);
  });
  it("payments: not set up, partly set up and malformed ids are feature problems", () => {
    const none = { ...good, RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "", RAZORPAY_PLAN_STARTER: "", RAZORPAY_PLAN_GROWTH: "", RAZORPAY_WEBHOOK_SECRET: "" };
    expect(featureProblems(none).map((p) => p.problem)).toEqual(["not set up"]);
    expect(blockingProblems(none)).toHaveLength(0);
    expect(featureProblems({ ...good, RAZORPAY_WEBHOOK_SECRET: "" })[0]!.problem).toBe("missing RAZORPAY_WEBHOOK_SECRET");
    expect(featureProblems({ ...good, RAZORPAY_KEY_ID: "key_123", RAZORPAY_PLAN_GROWTH: "Growth" }).map((p) => p.problem)).toEqual([
      "RAZORPAY_KEY_ID doesn't look like a Razorpay key id",
      "RAZORPAY_PLAN_GROWTH isn't a plan id",
    ]);
  });
});

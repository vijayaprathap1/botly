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
});

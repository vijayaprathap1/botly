import { afterEach, describe, expect, it, vi } from "vitest";

// QA R16: /setup is a developer env doctor; on a healthy production deploy it must 404.
const env = vi.hoisted(() => ({ blocking: [] as { name: string; problem: string; fix: string }[] }));
vi.mock("@/lib/env-check", () => ({ checkEnv: () => env.blocking, blockingProblems: () => env.blocking }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import SetupPage from "@/app/setup/page";

const render = (reason?: string) => SetupPage({ searchParams: Promise.resolve({ reason }) });

afterEach(() => {
  vi.unstubAllEnvs();
  env.blocking = [];
});

describe("/setup", () => {
  it("404s in production when settings are fine", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("is a plain outage page in production when the proxy reports Supabase unreachable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const html = JSON.stringify(await render("unreachable"));
    expect(html).toContain("briefly unavailable");
    expect(html).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
  it("still shows the env doctor in production when required settings are missing, and in development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    env.blocking = [{ name: "NEXT_PUBLIC_SUPABASE_URL", problem: "missing", fix: "set it" }];
    expect(JSON.stringify(await render())).toContain("Finish setting up Botly");
    vi.stubEnv("NODE_ENV", "development");
    env.blocking = [];
    expect(JSON.stringify(await render())).toContain("Finish setting up Botly");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "@/lib/chat/memory-store";
import { fixtureToBot, loadEvalFile } from "@/lib/eval/fixture";
import { MemoryRateLimiter } from "@/lib/security/rate-limit";

/** /api/chat refuses pages outside the bot's allowed domains with a plain 403, before streaming. */
const fixture = loadEvalFile("evals/ananya-handlooms.yaml").fixture!;
const store = new MemoryStore();
const llm = { stream: vi.fn(async (_r: unknown, onText: (t: string) => void) => (onText("Hi"), { content: [{ type: "text", text: "Hi" }], stopReason: "end_turn", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, firstTokenMs: 1 })) };

vi.mock("@/lib/chat/deps", () => ({ serverDeps: () => ({ store, llm, limiter: new MemoryRateLimiter(), notifiers: [] }) }));
vi.mock("@/lib/auth", () => ({ getSession: async () => null }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));

const { bot, knowledge } = fixtureToBot(fixture);
const post = (headers: Record<string, string>, extra: Record<string, unknown> = {}) =>
  new Request("https://botly.in/api/chat", {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", ...headers },
    body: JSON.stringify({ key: bot.public_key, visitorId: "visitor-123456", message: "Hello", pageUrl: "https://x/", pageTitle: "x", ...extra }),
  });

beforeEach(() => {
  store.bots.clear();
  store.addBot({ ...bot, status: "live", active: true, allowed_origins: ["ananya.in", "*.myshopify.com"] }, knowledge);
  llm.stream.mockClear();
});

describe("/api/chat origin lock", () => {
  it.each([
    ["https://evil.com", 403],
    ["https://ananya.in.evil.io", 403],
    ["null", 403],
  ])("Origin %s → %i without calling the model", async (origin, code) => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(post({ origin }));
    expect(res.status).toBe(code);
    expect((await res.json()).error.code).toBe("origin");
    expect(llm.stream).not.toHaveBeenCalled();
  });

  it("no Origin and no Referer → 403", async () => {
    const { POST } = await import("@/app/api/chat/route");
    expect((await POST(post({}))).status).toBe(403);
  });

  it.each(["https://ananya.in", "https://www.ananya.in", "http://ananya.in:8080", "https://shop.myshopify.com"])("allowed %s → streams", async (origin) => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(post({ origin }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    await res.text();
  });

  it("a valid test token works from anywhere (test link, dashboard preview); a wrong one is 403", async () => {
    const { POST } = await import("@/app/api/chat/route");
    expect((await POST(post({}, { testToken: bot.test_token }))).status).toBe(200);
    const bad = await POST(post({ origin: "https://evil.com" }, { testToken: "tt_" + "0".repeat(64) }));
    expect(bad.status).toBe(403);
    expect((await bad.json()).error.code).toBe("bad_token");
  });
});

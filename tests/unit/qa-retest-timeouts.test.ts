import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLIENT_REPLY_TIMEOUT_MS } from "@/widget/src/api";
import { chatTimeoutMs } from "@/lib/llm/openai-compat";

describe("QA retest 2026-10-25 item 3: client timeout outlasts the server", () => {
  const maxDuration = Number(/export const maxDuration = (\d+)/.exec(readFileSync("app/api/chat/route.ts", "utf8"))?.[1]);
  it("widget waits longer than /api/chat may run", () => {
    expect(maxDuration).toBeGreaterThan(0);
    expect(CLIENT_REPLY_TIMEOUT_MS).toBeGreaterThan(maxDuration * 1000);
  });
  it("an LLM call gives up well inside the function's lifetime", () => {
    expect(chatTimeoutMs()).toBeLessThan(maxDuration * 1000);
  });
});

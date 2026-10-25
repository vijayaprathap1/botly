import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACTION_NETWORK_ERROR,
  ACTION_STALE_ERROR,
  ACTION_TIMEOUT_ERROR,
  withActionFallback,
} from "@/lib/action-safety";

describe("QA retest 2026-10-25 item 6: settings save never hangs or hits the error boundary", () => {
  afterEach(() => vi.useRealTimers());

  it("passes a normal result through", async () => {
    const f = withActionFallback(async (_s: null, _f: string) => ({ ok: true, message: "Saved." }));
    await expect(f(null, "x")).resolves.toEqual({ ok: true, message: "Saved." });
  });

  it("a dropped connection (TypeError: Failed to fetch) becomes an inline error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = withActionFallback(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(f()).resolves.toEqual({ error: ACTION_NETWORK_ERROR });
  });

  it("a stale action id after a deploy asks for a refresh", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = withActionFallback(async () => {
      throw new Error('Server Action "abc123" was not found on the server.');
    });
    await expect(f()).resolves.toEqual({ error: ACTION_STALE_ERROR });
  });

  it("redirect()/notFound() still propagate", async () => {
    const err = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    const f = withActionFallback(async () => {
      throw err;
    });
    await expect(f()).rejects.toBe(err);
  });

  it("a hung request resolves with a timeout message instead of Saving… forever", async () => {
    vi.useFakeTimers();
    const f = withActionFallback(() => new Promise<never>(() => {}), 30_000);
    const p = f();
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(p).resolves.toEqual({ error: ACTION_TIMEOUT_ERROR });
  });
});

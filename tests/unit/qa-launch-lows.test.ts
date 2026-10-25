import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POLICIES_LAST_UPDATED } from "@/lib/legal";
import { knowledgeFilterHref } from "@/lib/knowledge-filters";
import { replyGateFromOrg } from "@/lib/quota";
import { retryAfterToMs, sendFailureText } from "@/widget/src/api";

describe("QA launch lows 2026-10-25", () => {
  describe("1. HTTP 429 shows a busy state", () => {
    it("429 gets a calm busy line, not 'something went wrong'", () => {
      expect(sendFailureText({ status: 429 })).toBe("Not sent. We're a little busy right now. Try again in a moment.");
      expect(sendFailureText({ status: 500 })).toBe("Not sent. Something went wrong on our side.");
      expect(sendFailureText({})).toBe("Not sent. Check your connection.");
      expect(sendFailureText({ status: 429, offline: true })).toBe("Not sent. Check your connection.");
    });
    it("reads Retry-After as seconds or a date, capped at 60 s", () => {
      expect(retryAfterToMs("5")).toBe(5000);
      expect(retryAfterToMs("600")).toBe(60_000);
      expect(retryAfterToMs(null)).toBeNull();
      expect(retryAfterToMs("soon")).toBeNull();
      const now = Date.parse("2026-10-25T10:00:00Z");
      expect(retryAfterToMs("Sun, 25 Oct 2026 10:00:08 GMT", now)).toBe(8000);
    });
  });

  describe("2. paused card on open: same rules as check_reply", () => {
    const now = new Date("2026-10-25T10:00:00Z");
    const trial = { plan: "trial", suspended: false, trial_ends_at: "2026-11-01T00:00:00Z", trial_reply_limit: 50, trial_replies_used: 18 };
    it("an active trial is ok", () => expect(replyGateFromOrg(trial, now)).toBe("ok"));
    it("an ended trial is paused", () => expect(replyGateFromOrg({ ...trial, trial_ends_at: "2026-10-24T00:00:00Z" }, now)).toBe("expired"));
    it("a used-up trial is paused", () => expect(replyGateFromOrg({ ...trial, trial_replies_used: 50 }, now)).toBe("limit"));
    it("suspended wins; paid plans ignore trial fields", () => {
      expect(replyGateFromOrg({ ...trial, plan: "starter", suspended: true }, now)).toBe("suspended");
      expect(replyGateFromOrg({ ...trial, plan: "starter", trial_ends_at: "2020-01-01T00:00:00Z", trial_replies_used: 99 }, now)).toBe("ok");
    });
    it("the widget config route uses it", () => {
      expect(readFileSync("app/api/widget/config/route.ts", "utf8")).toMatch(/quotaExceeded: used >= quota \|\| replyGateFromOrg\(bot\.org\) !== "ok"/);
    });
  });

  describe("3. Knowledge filter links", () => {
    const base = "/app/bots/b1/knowledge";
    it("builds the link for the clicked filter, keeping the others", () => {
      expect(knowledgeFilterHref(base, { status: "draft", type: "faq", q: "price" })).toBe(`${base}?status=draft&type=faq&q=price`);
      expect(knowledgeFilterHref(base, { status: "approved", type: undefined })).toBe(`${base}?status=approved`);
      expect(knowledgeFilterHref(base, {})).toBe(base);
    });
  });

  describe("5. policy pages carry the full date", () => {
    it("is 25 October 2026", () => expect(POLICIES_LAST_UPDATED).toBe("25 October 2026"));
    for (const page of ["refund-policy", "terms", "privacy-policy", "privacy", "shipping-policy"]) {
      it(`${page} shows it and never the build year`, () => {
        const src = readFileSync(`app/${page}/page.tsx`, "utf8");
        expect(src).toContain("Last updated {POLICIES_LAST_UPDATED}");
        expect(src).not.toMatch(/getFullYear/);
      });
    }
  });

  it("4. README no longer says '+ GST'", () => {
    expect(readFileSync("README.md", "utf8")).not.toMatch(/\+ GST/);
  });
});

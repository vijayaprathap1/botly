import { describe, expect, it } from "vitest";
import { nextTrialEmail, renderTrialEmail } from "../../lib/trial-emails";

const now = new Date("2026-10-01T04:00:00Z");
const base = { plan: "trial" as const, suspended: false, trial_reply_limit: 50, trial_replies_used: 0, trial_emails: {}, created_at: "2026-09-30T10:00:00Z", trial_ends_at: "2026-10-14T10:00:00Z" };

describe("trial emails", () => {
  it("welcomes a new trial once", () => {
    expect(nextTrialEmail(base, now)).toBe("welcome");
    expect(nextTrialEmail({ ...base, trial_emails: { welcome: "x" } }, now)).toBeNull();
  });
  it("warns at 80% of replies, then 2 days before the end, then when it ends", () => {
    const sent = { welcome: "x" };
    expect(nextTrialEmail({ ...base, trial_emails: sent, trial_replies_used: 40 }, now)).toBe("replies80");
    expect(nextTrialEmail({ ...base, trial_emails: sent, trial_ends_at: "2026-10-02T10:00:00Z" }, now)).toBe("ending");
    expect(nextTrialEmail({ ...base, trial_emails: sent, trial_replies_used: 50 }, now)).toBe("ended");
    expect(nextTrialEmail({ ...base, trial_emails: { ended: "x" }, trial_replies_used: 50 }, now)).toBeNull();
  });
  it("never emails paid, suspended or long-quiet trials", () => {
    expect(nextTrialEmail({ ...base, plan: "starter" }, now)).toBeNull();
    expect(nextTrialEmail({ ...base, suspended: true }, now)).toBeNull();
    expect(nextTrialEmail({ ...base, created_at: "2026-09-20T00:00:00Z", trial_emails: {} }, now)).toBeNull();
  });
  it("renders a plain subject and a link to billing", () => {
    const m = renderTrialEmail("ending", { name: "Crackers <Shop>", trial_reply_limit: 50, trial_replies_used: 10, trial_ends_at: "2026-10-02T10:00:00Z" }, now);
    expect(m.subject).toBe("Crackers <Shop>: your free trial ends in 2 days");
    expect(m.html).toContain("/app/billing");
    expect(m.html).not.toContain("<Shop>");
  });
});

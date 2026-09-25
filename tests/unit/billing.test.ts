import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { applySubscription, planForRazorpayPlan } from "@/lib/billing/apply";
import { verifyPaymentSignature, verifyWebhookSignature } from "@/lib/billing/razorpay";
import { trialState } from "@/lib/plans";

process.env.RAZORPAY_KEY_SECRET = "secret_key";
process.env.RAZORPAY_WEBHOOK_SECRET = "hook_secret";
process.env.RAZORPAY_PLAN_STARTER = "plan_S";
process.env.RAZORPAY_PLAN_GROWTH = "plan_G";

function fakeDb() {
  const updates: Record<string, unknown>[] = [];
  const db = { from: () => ({ update: (p: Record<string, unknown>) => ({ eq: async () => void updates.push(p) }) }) };
  return { db: db as never, updates };
}

describe("billing", () => {
  it("verifies Razorpay payment and webhook signatures", () => {
    const sig = createHmac("sha256", "secret_key").update("pay_1|sub_1").digest("hex");
    expect(verifyPaymentSignature("pay_1", "sub_1", sig)).toBe(true);
    expect(verifyPaymentSignature("pay_1", "sub_2", sig)).toBe(false);
    const body = '{"event":"subscription.charged"}';
    expect(verifyWebhookSignature(body, createHmac("sha256", "hook_secret").update(body).digest("hex"))).toBe(true);
    expect(verifyWebhookSignature(body, "bad")).toBe(false);
  });

  it("maps plans and applies subscription states", async () => {
    expect(planForRazorpayPlan("plan_G")).toBe("growth");
    expect(planForRazorpayPlan("nope")).toBeNull();
    const a = fakeDb();
    await applySubscription(a.db, "o", { id: "sub_1", plan_id: "plan_S", status: "active", current_start: 1, current_end: 1_900_000_000, ended_at: null });
    expect(a.updates[0]).toMatchObject({ plan: "starter", subscription_status: "active", monthly_conversation_quota: 2000 });
    const b = fakeDb();
    await applySubscription(b.db, "o", { id: "sub_1", plan_id: "plan_S", status: "halted", current_start: 1, current_end: 2, ended_at: null });
    expect(b.updates[0]).toMatchObject({ plan: "trial", subscription_status: "halted", trial_reply_limit: 0 });
  });

  it("trial state", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    expect(trialState({ plan: "starter" }, now)).toBeNull();
    expect(trialState({ plan: "trial", trial_ends_at: "2026-10-05T00:00:00Z", trial_reply_limit: 50, trial_replies_used: 10 }, now)).toMatchObject({ daysLeft: 4, left: 40, over: false });
    expect(trialState({ plan: "trial", trial_ends_at: "2026-09-30T00:00:00Z", trial_reply_limit: 50, trial_replies_used: 0 }, now)!.over).toBe(true);
    expect(trialState({ plan: "trial", trial_ends_at: "2026-10-05T00:00:00Z", trial_reply_limit: 50, trial_replies_used: 50 }, now)!.exhausted).toBe(true);
  });
});

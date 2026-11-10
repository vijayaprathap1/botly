import { createHmac } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// New pricing (Nov 2026): plan table, env-driven Razorpay ids, price guard, top-ups, founding slots.
const rzp = vi.hoisted(() => ({
  fetchPlan: vi.fn(),
  fetchOrder: vi.fn(),
  createOrder: vi.fn(),
  createSubscription: vi.fn(),
  cancelSubscription: vi.fn(async () => ({})),
}));
vi.mock("@/lib/billing/razorpay", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/razorpay")>()), ...rzp }));
const admin = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => admin.db }));
const ORG = "11111111-1111-4111-8111-111111111111";
vi.mock("@/lib/auth", () => ({
  requireSession: async () => ({ userId: "u1", email: "owner@example.com", orgIds: [ORG], isAdmin: false }),
  getSession: async () => ({ userId: "u1", email: "owner@example.com", orgIds: [ORG], isAdmin: false }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { applySubscription, planForRazorpayPlan, razorpayPlanInfo } from "@/lib/billing/apply";
import { planMismatch, type RzpOrder } from "@/lib/billing/razorpay";
import { applyTopupOrder, readTopupOrder, topupNotes } from "@/lib/billing/topup";
import { toolsForPlan } from "@/lib/chat/tools";
import { FOUNDING, canHideBranding, hasGrowthTools, monthlyCap, paidPlans, planDef, plans, TOPUP } from "@/lib/plans";
import { nextTrialEmail, renderTrialEmail } from "@/lib/trial-emails";
import { startCheckout, startTopup, switchToFree } from "@/app/app/billing/actions";
import { POST as topupRoute } from "@/app/api/billing/topup/route";
import { POST as webhook } from "@/app/api/billing/webhook/route";
import { Pricing } from "@/components/home/pricing";
import { homeFaqs } from "@/components/home/faq";

const env = {
  RAZORPAY_KEY_ID: "rzp_test_x",
  RAZORPAY_KEY_SECRET: "secret_key",
  RAZORPAY_WEBHOOK_SECRET: "hook_secret",
  RAZORPAY_PLAN_STARTER: "plan_S",
  RAZORPAY_PLAN_GROWTH: "plan_G",
  RAZORPAY_PLAN_PRO: "plan_P",
  RAZORPAY_PLAN_STARTER_YEARLY: "plan_SY",
  RAZORPAY_PLAN_GROWTH_YEARLY: "plan_GY",
  RAZORPAY_PLAN_PRO_YEARLY: "plan_PY",
  RAZORPAY_PLAN_GROWTH_FOUNDING: "plan_GF",
};
Object.assign(process.env, env);

/** Minimal supabase stand-in: one organization row, rpc calls recorded and answered. */
function fakeDb(org: Record<string, unknown> = {}, rpcAnswers: Record<string, unknown> = {}) {
  const updates: Record<string, unknown>[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const events = new Set<string>();
  const db = {
    from(table: string) {
      if (table === "billing_events") {
        return {
          insert: async (row: { id: string }) => (events.has(row.id) ? { error: { code: "23505" } } : (events.add(row.id), { error: null })),
          delete: () => ({ eq: async (_: string, id: string) => void events.delete(id) }),
        };
      }
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { id: ORG, ...org } }), maybeSingle: async () => ({ data: { id: ORG, ...org } }) }) }),
        update: (patch: Record<string, unknown>) => ({ eq: async () => (updates.push(patch), Object.assign(org, patch), { error: null }) }),
      };
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return { data: fn in rpcAnswers ? rpcAnswers[fn] : null, error: null };
    },
  };
  return { db, updates, rpcs, org };
}

const order = (o: Partial<RzpOrder> = {}): RzpOrder => ({
  id: "order_1", amount: 24900, amount_paid: 24900, currency: "INR", status: "paid", notes: topupNotes(ORG, "2026-11-01"), ...o,
});
const rzpPlan = (amountInr: number, period = "monthly") => ({ id: "x", period, interval: 1, item: { name: "x", amount: amountInr * 100, currency: "INR" } });

beforeEach(() => {
  for (const f of Object.values(rzp)) f.mockReset();
  rzp.cancelSubscription.mockResolvedValue({});
});

describe("plan table", () => {
  it("has the new prices, yearly = 10x, and the new caps", () => {
    const p = plans();
    expect([p.free.priceInr, p.starter.priceInr, p.growth.priceInr, p.pro.priceInr]).toEqual([0, 799, 1999, 4999]);
    expect([p.starter.yearlyInr, p.growth.yearlyInr, p.pro.yearlyInr]).toEqual([7990, 19990, 49990]);
    expect([p.free.conversations, p.starter.conversations, p.growth.conversations, p.pro.conversations]).toEqual([50, 500, 2000, 10000]);
    expect(paidPlans().map((x) => x.id)).toEqual(["starter", "growth", "pro"]);
    expect(TOPUP).toEqual({ priceInr: 249, conversations: 500 });
    expect(FOUNDING).toMatchObject({ plan: "growth", priceInr: 999, slots: 25, lockMonths: 12 });
    expect(p.pro.bots).toBe(3);
    expect(planDef("nonsense").id).toBe("free");
  });

  it("order lookup and callbacks are Growth and Pro only; so is hiding the branding", () => {
    for (const plan of ["growth", "pro"] as const) {
      expect(hasGrowthTools(plan)).toBe(true);
      expect(canHideBranding(plan)).toBe(true);
      expect(toolsForPlan(plan).map((t) => t.name)).toContain("lookup_order");
    }
    for (const plan of ["trial", "free", "starter"] as const) {
      expect(hasGrowthTools(plan)).toBe(false);
      expect(canHideBranding(plan)).toBe(false);
      expect(toolsForPlan(plan).map((t) => t.name)).not.toContain("lookup_order");
    }
  });

  it("adds this month's top-ups to the cap, never last month's", () => {
    expect(monthlyCap(50, {}, "2026-11-01")).toBe(50);
    expect(monthlyCap(50, { topup_month: "2026-11-01", topup_conversations: 1000 }, "2026-11-01")).toBe(1050);
    expect(monthlyCap(50, { topup_month: "2026-10-01", topup_conversations: 1000 }, "2026-11-01")).toBe(50);
  });
});

describe("Razorpay plan ids come from env", () => {
  it("maps monthly, yearly and founding ids", () => {
    expect(razorpayPlanInfo("plan_P")).toEqual({ plan: "pro", interval: "monthly", founding: false });
    expect(razorpayPlanInfo("plan_GY")).toEqual({ plan: "growth", interval: "yearly", founding: false });
    expect(razorpayPlanInfo("plan_GF")).toEqual({ plan: "growth", interval: "monthly", founding: true });
    expect(planForRazorpayPlan("plan_old_2999")).toBeNull();
    expect(planForRazorpayPlan("")).toBeNull();
  });

  it("refuses a Razorpay plan whose price or period differs from the site", () => {
    expect(planMismatch(rzpPlan(799), { amountInr: 799, yearly: false })).toBeNull();
    expect(planMismatch(rzpPlan(2999), { amountInr: 799, yearly: false })).toMatch(/₹2999 in Razorpay but the website shows ₹799/);
    expect(planMismatch(rzpPlan(7990, "monthly"), { amountInr: 7990, yearly: true })).toMatch(/expected yearly/);
  });

  it("a founding subscription counts its slot with the 12-month lock; an ended plan drops to Free", async () => {
    const a = fakeDb();
    await applySubscription(a.db as never, ORG, { id: "sub_f", plan_id: "plan_GF", status: "active", current_start: 1, current_end: 2, ended_at: null });
    expect(a.updates[0]).toMatchObject({ plan: "growth", monthly_conversation_quota: 2000 });
    expect(a.rpcs).toEqual([{ fn: "confirm_founding_slot", args: { p_org_id: ORG, p_subscription_id: "sub_f", p_lock_months: 12 } }]);
    const b = fakeDb();
    await applySubscription(b.db as never, ORG, { id: "sub_p", plan_id: "plan_PY", status: "active", current_start: 1, current_end: 2, ended_at: null });
    expect(b.updates[0]).toMatchObject({ plan: "pro", monthly_conversation_quota: 10000 });
    expect(b.rpcs).toEqual([]);
    const c = fakeDb();
    await applySubscription(c.db as never, ORG, { id: "sub_p", plan_id: "plan_P", status: "cancelled", current_start: 1, current_end: 2, ended_at: 3 });
    expect(c.updates[0]).toMatchObject({ plan: "free", monthly_conversation_quota: 50, subscription_status: "cancelled" });
  });
});

describe("checkout", () => {
  it("charges only when the Razorpay plan matches the price on the page", async () => {
    admin.db = fakeDb({ subscription_status: "none", plan: "free", name: "Shop" }).db;
    rzp.fetchPlan.mockResolvedValue(rzpPlan(2999)); // env still pointing at the old plan
    expect((await startCheckout(ORG, "starter"))?.error).toMatch(/isn't available for online payment/);
    expect(rzp.createSubscription).not.toHaveBeenCalled();

    rzp.fetchPlan.mockResolvedValue(rzpPlan(7990, "yearly"));
    rzp.createSubscription.mockResolvedValue({ id: "sub_y" });
    expect(await startCheckout(ORG, "starter", "yearly")).toMatchObject({ subscriptionId: "sub_y" });
    expect(rzp.fetchPlan).toHaveBeenLastCalledWith("plan_SY");
    expect(rzp.createSubscription.mock.calls[0]![0]).toMatchObject({ planId: "plan_SY", yearly: true, founding: false });
  });

  it("founding price: Growth monthly only, needs a free slot, and holds it during checkout", async () => {
    const full = fakeDb({ subscription_status: "none", plan: "free", name: "Shop" }, { claim_founding_slot: false });
    admin.db = full.db;
    rzp.fetchPlan.mockResolvedValue(rzpPlan(999));
    expect((await startCheckout(ORG, "starter", "monthly", true))?.error).toMatch(/Growth, billed monthly/);
    expect((await startCheckout(ORG, "growth", "monthly", true))?.error).toMatch(/All founding slots have been taken/);
    expect(full.rpcs[0]).toEqual({ fn: "claim_founding_slot", args: { p_org_id: ORG, p_cap: 25, p_hold_minutes: 30 } });
    expect(rzp.createSubscription).not.toHaveBeenCalled();

    admin.db = fakeDb({ subscription_status: "none", plan: "free", name: "Shop" }, { claim_founding_slot: true }).db;
    rzp.createSubscription.mockResolvedValue({ id: "sub_f" });
    expect(await startCheckout(ORG, "growth", "monthly", true)).toMatchObject({ subscriptionId: "sub_f" });
    expect(rzp.createSubscription.mock.calls[0]![0]).toMatchObject({ planId: "plan_GF", founding: true });
  });

  it("without the founding plan id the offer asks them to contact us", async () => {
    delete process.env.RAZORPAY_PLAN_GROWTH_FOUNDING;
    admin.db = fakeDb({ subscription_status: "none", plan: "free" }).db;
    expect((await startCheckout(ORG, "growth", "monthly", true))?.error).toMatch(/contact us/);
    const html = renderToStaticMarkup(createElement(Pricing));
    expect(html).toContain("Contact us");
    process.env.RAZORPAY_PLAN_GROWTH_FOUNDING = env.RAZORPAY_PLAN_GROWTH_FOUNDING;
  });
});

describe("top-ups", () => {
  it("creates a ₹249 one-time order for this month, not for trials", async () => {
    admin.db = fakeDb({ plan: "trial" }).db;
    expect((await startTopup(ORG))?.error).toMatch(/Free and paid plans/);
    admin.db = fakeDb({ plan: "starter", timezone: "Asia/Kolkata", name: "Shop" }).db;
    rzp.createOrder.mockResolvedValue({ id: "order_1", amount: 24900 });
    expect(await startTopup(ORG)).toMatchObject({ orderId: "order_1", amount: 24900 });
    const args = rzp.createOrder.mock.calls[0]![0] as { amountPaise: number; notes: Record<string, string> };
    expect(args.amountPaise).toBe(24900);
    expect(args.notes).toMatchObject({ kind: "topup", org_id: ORG, conversations: "500" });
    expect(args.notes.month).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("credits a paid order once, and never an unpaid, foreign or malformed one", async () => {
    expect(readTopupOrder(order({ notes: { kind: "other" } }))).toBeNull();
    const m = fakeDb({}, { add_topup: "added" });
    expect(await applyTopupOrder(m.db as never, order({ status: "attempted", amount_paid: 0 }), "pay_1")).toBe("not_paid");
    expect(await applyTopupOrder(m.db as never, order(), "pay_1", "22222222-2222-4222-8222-222222222222")).toBe("invalid");
    expect(m.rpcs).toHaveLength(0);
    expect(await applyTopupOrder(m.db as never, order(), "pay_1", ORG)).toBe("added");
    expect(m.rpcs[0]).toEqual({ fn: "add_topup", args: { p_org_id: ORG, p_order_id: "order_1", p_payment_id: "pay_1", p_amount_paise: 24900, p_conversations: 500, p_month: "2026-11-01" } });
    const d = fakeDb({}, { add_topup: "duplicate" });
    expect(await applyTopupOrder(d.db as never, order(), "pay_1")).toBe("duplicate");
  });

  it("checkout callback: verifies the signature before crediting", async () => {
    const m = fakeDb({}, { add_topup: "added" });
    admin.db = m.db;
    rzp.fetchOrder.mockResolvedValue(order());
    const req = (sig: string) =>
      new Request("http://x/api/billing/topup", { method: "POST", body: JSON.stringify({ orgId: ORG, razorpay_payment_id: "pay_1", razorpay_order_id: "order_1", razorpay_signature: sig }) });
    expect((await topupRoute(req("f".repeat(64)))).status).toBe(400);
    expect(m.rpcs).toHaveLength(0);
    const good = createHmac("sha256", "secret_key").update("order_1|pay_1").digest("hex");
    expect(await (await topupRoute(req(good))).json()).toEqual({ ok: true, pending: false });
    expect(m.rpcs[0]!.fn).toBe("add_topup");
  });

  it("webhook order.paid credits the top-up (idempotent by event id)", async () => {
    const m = fakeDb({}, { add_topup: "added" });
    admin.db = m.db;
    const body = JSON.stringify({ event: "order.paid", payload: { order: { entity: order() }, payment: { entity: { id: "pay_9" } } } });
    const req = () => new Request("http://x/api/billing/webhook", { method: "POST", body, headers: { "x-razorpay-signature": createHmac("sha256", "hook_secret").update(body).digest("hex"), "x-razorpay-event-id": "evt_t1" } });
    expect((await webhook(req())).status).toBe(200);
    expect((await (await webhook(req())).json()).duplicate).toBe(true);
    expect(m.rpcs.map((r) => r.fn)).toEqual(["add_topup"]);
    expect(m.rpcs[0]!.args.p_payment_id).toBe("pay_9");
  });
});

describe("Free plan", () => {
  it("an owner without a paid plan can move to Free; a paying one can't", async () => {
    const t = fakeDb({ plan: "trial", subscription_status: "expired" });
    admin.db = t.db;
    expect(await switchToFree(ORG)).toEqual({ ok: true });
    expect(t.updates[0]).toEqual({ plan: "free", monthly_conversation_quota: 50, subscription_status: "none" });
    admin.db = fakeDb({ plan: "growth", subscription_status: "active" }).db;
    expect((await switchToFree(ORG)).error).toMatch(/Cancel your paid plan first/);
  });

  it("new Free workspaces get the welcome email only", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    const free = { plan: "free" as const, created_at: "2026-11-09T00:00:00Z", trial_emails: {} };
    expect(nextTrialEmail(free, now)).toBe("welcome");
    expect(nextTrialEmail({ ...free, trial_emails: { welcome: "x" } }, now)).toBeNull();
    expect(nextTrialEmail({ ...free, created_at: "2026-10-01T00:00:00Z" }, now)).toBeNull();
    const msg = renderTrialEmail("welcome", { name: "Shop", plan: "free", trial_reply_limit: 50, trial_replies_used: 0, trial_ends_at: null }, now);
    expect(msg.text).toContain("Free plan: 50 conversations a month");
    expect(msg.text).not.toMatch(/14 days|free trial/i);
  });
});

describe("site copy", () => {
  it("homepage pricing and FAQ show the new plans and no old prices or GST wording", () => {
    const html = renderToStaticMarkup(createElement(Pricing)) + JSON.stringify(homeFaqs());
    for (const s of ["₹0", "₹799", "₹1,999", "₹4,999", "₹7,990", "₹19,990", "₹49,990", "₹249", "₹999", "Free", "Starter", "Growth", "Pro", "first 25 shops", "12 months"]) expect(html).toContain(s);
    for (const s of ["2,999", "9,999", "2999", "9999", "GST", "10,000 conversations a month\",\"Everything in Starter"]) expect(html).not.toContain(s);
    expect(html).toContain("Order-status lookup (Shopify, WooCommerce)");
  });
});

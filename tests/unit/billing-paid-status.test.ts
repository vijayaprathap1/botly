import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// QA audit R9: a Razorpay subscription that is only "authenticated" (mandate set up,
// nothing charged) must not unlock a paid plan. Only "active" (activated/charged) does.
const rzp = vi.hoisted(() => ({ cancelSubscription: vi.fn(async () => ({})) }));
vi.mock("@/lib/billing/razorpay", async (orig) => ({ ...(await orig<typeof import("@/lib/billing/razorpay")>()), cancelSubscription: rzp.cancelSubscription }));
const admin = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => admin.db }));

import { activateSubscription, applySubscription, isPaidActive, isPaidStatus } from "@/lib/billing/apply";
import type { RzpSubscription } from "@/lib/billing/razorpay";
import { POST as webhook } from "@/app/api/billing/webhook/route";

process.env.RAZORPAY_KEY_SECRET = "secret_key";
process.env.RAZORPAY_WEBHOOK_SECRET = "hook_secret";
process.env.RAZORPAY_PLAN_STARTER = "plan_S";
process.env.RAZORPAY_PLAN_GROWTH = "plan_G";

const ORG = "11111111-1111-4111-8111-111111111111";
const sub = (status: RzpSubscription["status"], id = "sub_new"): RzpSubscription => ({ id, plan_id: "plan_S", status, current_start: 1, current_end: 1_900_000_000, ended_at: null, notes: { org_id: ORG, replaces: "sub_old" } });

/** In-memory organizations + billing_events, enough for the webhook route. */
function memoryDb(org: Record<string, unknown>) {
  const events = new Set<string>();
  const updates: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      if (table === "billing_events") {
        return {
          insert: async (row: { id: string }) => {
            if (events.has(row.id)) return { error: { code: "23505" } };
            events.add(row.id);
            return { error: null };
          },
          delete: () => ({ eq: async (_: string, id: string) => void events.delete(id) }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...org } }) }) }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(patch);
            Object.assign(org, patch);
            return { error: null };
          },
        }),
      };
    },
  };
  return { db, updates, org };
}

function hook(entity: RzpSubscription, event: string, id: string) {
  const body = JSON.stringify({ event, payload: { subscription: { entity } } });
  return new Request("http://x/api/billing/webhook", {
    method: "POST",
    body,
    headers: { "x-razorpay-signature": createHmac("sha256", "hook_secret").update(body).digest("hex"), "x-razorpay-event-id": id },
  });
}

beforeEach(() => vi.clearAllMocks());

describe("Razorpay paid status", () => {
  it("only active counts as paid", () => {
    expect(isPaidStatus("active")).toBe(true);
    for (const s of ["created", "authenticated", "pending", "halted", "cancelled", "completed", "expired", "paused"] as const) expect(isPaidStatus(s)).toBe(false);
    expect(isPaidActive(sub("authenticated"))).toBe(false);
    expect(isPaidActive(sub("active"))).toBe(true);
  });

  it("an authenticated subscription changes nothing; active switches the plan on", async () => {
    const m = memoryDb({ plan: "trial" });
    await applySubscription(m.db as never, ORG, sub("authenticated"));
    await applySubscription(m.db as never, ORG, sub("created"));
    expect(m.updates).toHaveLength(0);
    await applySubscription(m.db as never, ORG, sub("active"));
    expect(m.updates[0]).toMatchObject({ plan: "starter", subscription_status: "active" });
  });

  it("activateSubscription neither upgrades nor cancels the old plan until the new one is charged", async () => {
    const m = memoryDb({ plan: "growth", razorpay_subscription_id: "sub_old" });
    expect(await activateSubscription(m.db as never, ORG, sub("authenticated"))).toBe(false);
    expect(m.updates).toHaveLength(0);
    expect(rzp.cancelSubscription).not.toHaveBeenCalled();
    expect(await activateSubscription(m.db as never, ORG, sub("active"))).toBe(true);
    expect(m.org.plan).toBe("starter");
    expect(rzp.cancelSubscription).toHaveBeenCalledWith("sub_old", false);
  });

  it("webhook: authenticated is ignored, activated upgrades, duplicates and late authenticated events are no-ops", async () => {
    const m = memoryDb({ plan: "trial", razorpay_subscription_id: null });
    admin.db = m.db;
    expect((await (await webhook(hook(sub("authenticated"), "subscription.authenticated", "evt_1"))).json()).ok).toBe(true);
    expect(m.org.plan).toBe("trial");
    expect(m.updates).toHaveLength(0);

    await webhook(hook(sub("active"), "subscription.activated", "evt_2"));
    expect(m.org).toMatchObject({ plan: "starter", subscription_status: "active", razorpay_subscription_id: "sub_new" });
    const after = m.updates.length;

    expect((await (await webhook(hook(sub("active"), "subscription.activated", "evt_2"))).json()).duplicate).toBe(true);
    // An authenticated event delivered late for the now-current subscription must not downgrade it.
    await webhook(hook(sub("authenticated"), "subscription.authenticated", "evt_3"));
    expect(m.updates.length).toBe(after);
    expect(m.org.plan).toBe("starter");
  });
});

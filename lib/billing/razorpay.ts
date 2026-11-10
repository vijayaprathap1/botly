import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay Subscriptions (server side). Needs RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET
 * (Dashboard → Account & Settings → API keys) and a plan id per paid tier and interval
 * (Dashboard → Subscriptions → Plans) in RAZORPAY_PLAN_{STARTER,GROWTH,PRO}[_YEARLY]
 * and RAZORPAY_PLAN_GROWTH_FOUNDING. Top-up packs are one-time Orders (no plan needed).
 */
const base = () => process.env.RAZORPAY_API_URL || "https://api.razorpay.com/v1";
export const razorpayConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`${base()}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 200);
    try {
      msg = (JSON.parse(text) as { error?: { description?: string } }).error?.description ?? msg;
    } catch {}
    throw new Error(`Razorpay ${res.status}: ${msg}`);
  }
  return JSON.parse(text) as T;
}

export type RzpSubscription = {
  id: string;
  plan_id: string;
  status: "created" | "authenticated" | "active" | "pending" | "halted" | "cancelled" | "completed" | "expired" | "paused";
  current_start: number | null;
  current_end: number | null;
  ended_at: number | null;
  short_url?: string;
  notes?: Record<string, string>;
};

/**
 * `replaces` = the subscription this one takes over from when a paying customer switches
 * plans. It is only cancelled once the new one is paid (see activateSubscription).
 */
export function createSubscription(args: { planId: string; orgId: string; email: string | null; replaces?: string; billingName?: string; yearly?: boolean; founding?: boolean }) {
  return call<RzpSubscription>("/subscriptions", {
    method: "POST",
    body: {
      plan_id: args.planId,
      // Ten years of renewals either way; the customer can cancel any time.
      total_count: args.yearly ? 10 : 120,
      quantity: 1,
      customer_notify: 1,
      notes: { org_id: args.orgId, email: args.email ?? "", replaces: args.replaces ?? "", billing_name: args.billingName ?? "", offer: args.founding ? "founding" : "" },
    },
  });
}

export type RzpOrder = { id: string; amount: number; amount_paid: number; currency: string; status: "created" | "attempted" | "paid"; receipt?: string; notes?: Record<string, string> };

/** One-time payment (top-up pack). Amount in paise. */
export function createOrder(args: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
  return call<RzpOrder>("/orders", { method: "POST", body: { amount: args.amountPaise, currency: "INR", receipt: args.receipt.slice(0, 40), notes: args.notes } });
}

export const fetchOrder = (id: string) => call<RzpOrder>(`/orders/${encodeURIComponent(id)}`);

export type RzpPlan = { id: string; period: string; interval: number; item: { name: string; amount: number; currency: string } };
export const fetchPlan = (id: string) => call<RzpPlan>(`/plans/${encodeURIComponent(id)}`);

/**
 * Why a Razorpay plan must not be sold at the price we show, or null when it matches.
 * Guards against an env var still pointing at an old plan (e.g. ₹2,999 after a price change).
 */
export function planMismatch(rp: Pick<RzpPlan, "period" | "interval" | "item">, expect: { amountInr: number; yearly: boolean }): string | null {
  const period = expect.yearly ? "yearly" : "monthly";
  if (rp.period !== period || rp.interval !== 1) return `billed every ${rp.interval} ${rp.period}, expected ${period}`;
  if (rp.item.currency !== "INR") return `currency ${rp.item.currency}, expected INR`;
  if (rp.item.amount !== Math.round(expect.amountInr * 100)) return `₹${rp.item.amount / 100} in Razorpay but the website shows ₹${expect.amountInr}`;
  return null;
}

/** "test" or "live" from the key id, for setup messages. */
export const razorpayMode = () => (process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") ? "live" : "test");

export const fetchSubscription = (id: string) => call<RzpSubscription>(`/subscriptions/${encodeURIComponent(id)}`);

export const cancelSubscription = (id: string, atCycleEnd: boolean) =>
  call<RzpSubscription>(`/subscriptions/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 } });

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Checkout success: hmac_sha256(payment_id + "|" + subscription_id, key_secret). */
export function verifyPaymentSignature(paymentId: string, subscriptionId: string, signature: string): boolean {
  const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "").update(`${paymentId}|${subscriptionId}`).digest("hex");
  return safeEqual(expected, signature);
}

/** Order checkout success: hmac_sha256(order_id + "|" + payment_id, key_secret). */
export function verifyOrderSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "").update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
}

/** Webhooks: X-Razorpay-Signature = hmac_sha256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

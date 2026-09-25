import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay Subscriptions (server side). Needs RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET
 * (Dashboard → Account & Settings → API keys) and a plan per paid tier
 * (Dashboard → Subscriptions → Plans) in RAZORPAY_PLAN_STARTER / RAZORPAY_PLAN_GROWTH.
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

export function createSubscription(args: { planId: string; orgId: string; email: string | null }) {
  return call<RzpSubscription>("/subscriptions", {
    method: "POST",
    body: { plan_id: args.planId, total_count: 120, quantity: 1, customer_notify: 1, notes: { org_id: args.orgId, email: args.email ?? "" } },
  });
}

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

/** Webhooks: X-Razorpay-Signature = hmac_sha256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

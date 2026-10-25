/**
 * Maps a Razorpay webhook event onto the growth events in the analytics spec.
 * Renewals (`subscription.charged`) use the same activation event; the unique
 * index on (org, subscription id) keeps one row per subscription.
 * `subscription.halted` is a payment failure (retries exhausted). `completed`
 * and `expired` end the subscription the same way a cancellation does, so the
 * daily paid total can drop. The reason column says which one it was.
 */
export type BillingTrack =
  | { name: "subscription_activated" }
  | { name: "payment_failed"; reason: string }
  | { name: "subscription_cancelled"; reason: string };

function clip(value: string | null | undefined): string {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
}

export function billingTrackFor(event: string | null | undefined, detail?: { errorReason?: string | null }): BillingTrack | null {
  switch (event) {
    case "subscription.activated":
    case "subscription.authenticated":
    case "subscription.charged":
      return { name: "subscription_activated" };
    case "subscription.pending":
      return { name: "payment_failed", reason: "pending" };
    case "subscription.halted":
      return { name: "payment_failed", reason: "halted" };
    case "payment.failed":
      return { name: "payment_failed", reason: clip(detail?.errorReason) || "payment_failed" };
    case "subscription.cancelled":
      return { name: "subscription_cancelled", reason: "cancelled" };
    case "subscription.completed":
      return { name: "subscription_cancelled", reason: "completed" };
    case "subscription.expired":
      return { name: "subscription_cancelled", reason: "expired" };
    default:
      return null;
  }
}

/** Self-serve plans are monthly (see createSubscription). There is no yearly price. */
export const CHECKOUT_BILLING_PERIOD = "monthly";

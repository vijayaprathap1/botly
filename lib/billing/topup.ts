import type { SupabaseClient } from "@supabase/supabase-js";
import { TOPUP } from "../plans";
import type { RzpOrder } from "./razorpay";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-\d{2}-01$/;

/** Notes we attach to a top-up order; they travel back with the order and the webhook. */
export function topupNotes(orgId: string, month: string): Record<string, string> {
  return { kind: "topup", org_id: orgId, month, conversations: String(TOPUP.conversations) };
}

export type TopupResult = "added" | "duplicate" | "not_paid" | "invalid";

/** Parses an order we created as a top-up; null if it isn't one (wrong kind, bad notes). */
export function readTopupOrder(order: Pick<RzpOrder, "notes" | "amount">): { orgId: string; month: string; conversations: number } | null {
  const n = order.notes ?? {};
  if (n.kind !== "topup" || !UUID.test(n.org_id ?? "") || !MONTH.test(n.month ?? "")) return null;
  const conversations = Number(n.conversations);
  if (!Number.isInteger(conversations) || conversations <= 0 || conversations > 100_000) return null;
  if (!Number.isInteger(order.amount) || order.amount <= 0) return null;
  return { orgId: n.org_id!, month: n.month!, conversations };
}

/**
 * Credits a paid top-up order once (the order id is the idempotency key in quota_topups).
 * Only call after the checkout signature or the webhook signature has been verified.
 */
export async function applyTopupOrder(db: SupabaseClient, order: RzpOrder, paymentId: string | null, expectedOrgId?: string): Promise<TopupResult> {
  const t = readTopupOrder(order);
  if (!t || (expectedOrgId && t.orgId !== expectedOrgId)) return "invalid";
  if (order.status !== "paid" || order.amount_paid < order.amount) return "not_paid";
  const { data, error } = await db.rpc("add_topup", {
    p_org_id: t.orgId,
    p_order_id: order.id,
    p_payment_id: paymentId,
    p_amount_paise: order.amount,
    p_conversations: t.conversations,
    p_month: t.month,
  });
  if (error) throw new Error(error.message);
  return data === "added" ? "added" : "duplicate";
}

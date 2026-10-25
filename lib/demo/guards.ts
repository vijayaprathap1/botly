import { randomBytes } from "node:crypto";

/** Same shape as the bots.test_token default: tt_ plus 64 hex characters. */
export function newTestToken(): string {
  return "tt_" + randomBytes(16).toString("hex") + randomBytes(16).toString("hex");
}

/** Replace a token baked into a stored homepage copy. No-op when there is nothing to swap. */
export function swapSnapshotToken(html: string, from: string, to: string): string {
  if (!html || !from || !to || from === to) return html;
  return html.split(from).join(to);
}

/**
 * Org fields that make chat work again after "+14 days".
 * Resets the reply counter (the limit stays DEMO_REPLY_LIMIT) and clears a lapsed trial.
 */
export function demoTopUpPatch(expires: Date) {
  return {
    trial_ends_at: expires.toISOString(),
    trial_replies_used: 0,
    subscription_status: "trialing" as const,
  };
}

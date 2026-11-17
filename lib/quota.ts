export type QuotaState = "ok" | "warning" | "exceeded";

/** This month's conversations for a whole workspace (all its assistants), from usage_monthly. */
export type OrgUsage = {
  /** Conversations started by all the workspace's assistants this month (test chats never count). */
  total: number;
  /** The same, per assistant (bot id → conversations). Missing ids have 0. */
  byBot: Record<string, number>;
  /** True when the 80% warning was already sent for any of the workspace's assistants this month. */
  warned: boolean;
};

/** Folds usage_monthly rows (one per assistant) into the workspace total. */
export function sumOrgUsage(rows: { bot_id: string; conversations: number; quota_warned_at?: string | null }[]): OrgUsage {
  const byBot: Record<string, number> = {};
  let total = 0;
  let warned = false;
  for (const r of rows) {
    byBot[r.bot_id] = (byBot[r.bot_id] ?? 0) + (r.conversations ?? 0);
    total += r.conversations ?? 0;
    if (r.quota_warned_at) warned = true;
  }
  return { total, byBot, warned };
}

/**
 * How far ONE assistant may go this month under its workspace's SHARED monthly limit.
 *
 * The plan's number (Free 50, Starter 500, Growth 2,000, Pro 10,000) plus top-ups is one total
 * for the whole workspace, not per assistant: Pro's 3 assistants share 10,000. The atomic
 * `begin_conversation` SQL function (migration 0002) counts a single assistant's usage_monthly
 * row, so the shared limit is translated into that assistant's terms: it may reach its own count
 * plus whatever the workspace has left.
 *
 * `botOverride` (super-admin "quota override for this bot") is an extra, tighter cap for one
 * assistant inside the shared limit; it can never lift the workspace above its plan.
 *
 * Returns `quota` to pass to begin_conversation, plus `used`/`limit` for the 80% warning and UI.
 */
export function conversationAllowance(a: {
  orgCap: number;
  botOverride: number | null | undefined;
  orgUsed: number;
  botUsed: number;
}): { quota: number; used: number; limit: number; scope: "workspace" | "assistant" } {
  const left = Math.max(0, a.orgCap - a.orgUsed);
  const shared = a.botUsed + left;
  if (a.botOverride != null && a.botOverride < shared) return { quota: a.botOverride, used: a.botUsed, limit: a.botOverride, scope: "assistant" };
  return { quota: shared, used: a.orgUsed, limit: a.orgCap, scope: "workspace" };
}

export function quotaState(used: number, quota: number): { state: QuotaState; percent: number } {
  if (quota <= 0) return { state: "exceeded", percent: 100 };
  const percent = Math.round((used / quota) * 1000) / 10;
  if (used >= quota) return { state: "exceeded", percent };
  if (used >= quota * 0.8) return { state: "warning", percent };
  return { state: "ok", percent };
}

/** True exactly when this increment crossed the 80% line and no warning was sent yet. */
export function shouldSendQuotaWarning(usedAfter: number, quota: number, alreadyWarned: boolean): boolean {
  return !alreadyWarned && quota > 0 && usedAfter >= Math.ceil(quota * 0.8);
}

/** First day of the month (YYYY-MM-01) in the org's timezone. */
export function monthKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}-01`;
}

/**
 * Same rules as the `check_reply` SQL gate (migration 0011), from an organization row that
 * is already loaded. The widget config uses it to show the "paused" card on open instead of
 * after the visitor's first message. The chat API still asks the database before every reply.
 */
export function replyGateFromOrg(
  org: { plan: string; suspended?: boolean | null; trial_ends_at?: string | null; trial_reply_limit?: number | null; trial_replies_used?: number | null },
  now: Date = new Date(),
): "ok" | "expired" | "limit" | "suspended" {
  if (org.suspended) return "suspended";
  if (org.plan !== "trial") return "ok";
  if (org.trial_ends_at && new Date(org.trial_ends_at).getTime() < now.getTime()) return "expired";
  if (org.trial_reply_limit != null && (org.trial_replies_used ?? 0) >= org.trial_reply_limit) return "limit";
  return "ok";
}

export type QuotaState = "ok" | "warning" | "exceeded";

export function effectiveQuota(orgQuota: number, botOverride: number | null | undefined): number {
  return botOverride ?? orgQuota;
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

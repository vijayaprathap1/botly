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

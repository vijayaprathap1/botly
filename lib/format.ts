export function fmtDateTime(iso: string | null | undefined, timeZone = "Asia/Kolkata"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
export function fmtDate(iso: string | null | undefined, timeZone = "Asia/Kolkata"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}
export const fmtInt = (n: number | null | undefined) => new Intl.NumberFormat("en-IN").format(n ?? 0);
export function fmtUsd(n: number | string | null | undefined, digits = 2): string {
  const v = Number(n ?? 0);
  return `$${v < 0.01 && v > 0 ? v.toFixed(4) : v.toFixed(digits)}`;
}
/** Start of the month (UTC instant) for a YYYY-MM-01 key in a timezone. Approximate to the day boundary. */
export function monthStartIso(monthKey: string, timeZone: string): string {
  const guess = new Date(`${monthKey}T00:00:00Z`);
  const offsetMin = tzOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offsetMin * 60_000).toISOString();
}
function tzOffsetMinutes(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - d.getTime()) / 60_000);
}

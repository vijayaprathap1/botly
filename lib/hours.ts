/** Business hours: { mon: [["10:00","19:00"]], ..., sun: [] } in the org timezone. */
export type BusinessHours = Partial<Record<Day, [string, string][]>>;
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
const DAY_LABEL: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

function localParts(now: Date, timeZone: string): { day: Day; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const wd = (parts.find((p) => p.type === "weekday")?.value ?? "Mon").slice(0, 3).toLowerCase() as Day;
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { day: wd, minutes: h * 60 + m };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function isOpenNow(hours: BusinessHours | null | undefined, timeZone: string, now = new Date()): boolean {
  if (!hours) return true;
  const { day, minutes } = localParts(now, timeZone);
  return (hours[day] ?? []).some(([a, b]) => minutes >= toMin(a) && minutes < toMin(b));
}

/** "Mon–Sat 10:00–19:00; Sun closed" */
export function formatHours(hours: BusinessHours | null | undefined): string {
  if (!hours) return "not specified";
  const spec = (d: Day) => (hours[d] ?? []).map(([a, b]) => `${a}–${b}`).join(", ") || "closed";
  const groups: { from: Day; to: Day; spec: string }[] = [];
  for (const d of DAYS) {
    const s = spec(d);
    const last = groups[groups.length - 1];
    if (last && last.spec === s) last.to = d;
    else groups.push({ from: d, to: d, spec: s });
  }
  return groups
    .map((g) => `${DAY_LABEL[g.from]}${g.from === g.to ? "" : "–" + DAY_LABEL[g.to]} ${g.spec}`)
    .join("; ");
}

export function formatNow(now: Date, timeZone: string): string {
  return (
    new Intl.DateTimeFormat("en-IN", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(now) + ` (${timeZone})`
  );
}

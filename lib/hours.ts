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
  if (!hours || hoursNotSet(hours)) return "not specified (answer questions about opening hours only from <knowledge>)";
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

/** "Hours not set": open all day, every day. Shown to the model as "not specified" so it answers from the knowledge instead. */
export const HOURS_NOT_SET: BusinessHours = Object.fromEntries(DAYS.map((d) => [d, [["00:00", "23:59"]]])) as BusinessHours;
export function hoursNotSet(hours: BusinessHours | null | undefined): boolean {
  return !hours || DAYS.every((d) => (hours[d] ?? []).length === 1 && hours[d]![0]![0] === "00:00" && hours[d]![0]![1] === "23:59");
}

const DAY_WORDS: Record<string, Day> = { mon: "mon", monday: "mon", tue: "tue", tues: "tue", tuesday: "tue", wed: "wed", weds: "wed", wednesday: "wed", thu: "thu", thur: "thu", thurs: "thu", thursday: "thu", fri: "fri", friday: "fri", sat: "sat", saturday: "sat", sun: "sun", sunday: "sun" };
const DAY_RE = "(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
const TIME_RE = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|—|to|till|until)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;

function to24(h: number, m: number, mer: "am" | "pm" | null): number | null {
  if (m > 59 || h > 24) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (mer === "pm" ? 12 : 0);
  }
  return h * 60 + m;
}
const hhmm = (min: number) => `${String(Math.floor(Math.min(min, 23 * 60 + 59) / 60)).padStart(2, "0")}:${String(Math.min(min, 23 * 60 + 59) % 60).padStart(2, "0")}`;

/**
 * Opening hours as people type them ("Mon–Sat 10 am – 8 pm", "Mon-Fri 9:30-18:00, Sat 10am-2pm",
 * "10am to 9pm daily", "24 hours") → BusinessHours. Returns null when it can't be read
 * with confidence; the caller then leaves the hours "not set" rather than guessing.
 */
export function parseHoursText(input: string): BusinessHours | null {
  const text = input.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (/\b24\s*(?:hours|hrs|x\s*7|\/\s*7)\b|\bopen 24\b|\bround the clock\b/.test(text)) return structuredClone(HOURS_NOT_SET);
  const out: BusinessHours = {};
  let sawDays = false;
  let sawTime = false;
  for (const seg of text.split(/[,;\n]|\band\b(?=\s*(?:mon|tue|wed|thu|fri|sat|sun))/)) {
    const s = seg.trim();
    if (!s) continue;
    // Which days this part is about.
    let days: Day[] = [];
    const range = new RegExp(DAY_RE + String.raw`\w*\s*(?:-|–|—|to|through)\s*` + DAY_RE).exec(s);
    if (range) {
      const a = DAYS.indexOf(DAY_WORDS[range[1]!]!);
      const b = DAYS.indexOf(DAY_WORDS[range[2]!]!);
      for (let i = a; ; i = (i + 1) % 7) {
        days.push(DAYS[i]!);
        if (i === b) break;
      }
    } else {
      days = [...s.matchAll(new RegExp(String.raw`\b` + DAY_RE + String.raw`\b`, "g"))].map((m) => DAY_WORDS[m[1]!]!);
      if (!days.length && /\bweekdays\b/.test(s)) days = ["mon", "tue", "wed", "thu", "fri"];
      if (!days.length && /\bweekends?\b/.test(s)) days = ["sat", "sun"];
    }
    const named = days.length > 0;
    if (!named) days = [...DAYS]; // "10am–8pm", "daily", "all days"
    if (/\b(closed|holiday|off)\b/.test(s) && !TIME_RE.test(s)) {
      if (!named) return null;
      sawDays = true;
      for (const d of days) out[d] = [];
      continue;
    }
    const t = TIME_RE.exec(s);
    if (!t) {
      if (named) return null; // days without a time we can read
      continue;
    }
    const mer = (v?: string) => (v ? (v.startsWith("a") ? "am" : "pm") : null) as "am" | "pm" | null;
    const endMer = mer(t[6]);
    let startMer = mer(t[3]);
    const endMin = to24(Number(t[4]), Number(t[5] ?? 0), endMer);
    let startMin = to24(Number(t[1]), Number(t[2] ?? 0), startMer);
    if (!startMer && endMer) {
      // "10 – 8 pm" → 10 am; "2 – 8 pm" → 2 pm.
      const same = to24(Number(t[1]), Number(t[2] ?? 0), endMer);
      startMer = same !== null && endMin !== null && same < endMin ? endMer : endMer === "pm" ? "am" : "pm";
      startMin = to24(Number(t[1]), Number(t[2] ?? 0), startMer);
    }
    if (startMin === null || endMin === null || startMin >= endMin) return null;
    sawTime = true;
    if (named) sawDays = true;
    for (const d of days) out[d] = [[hhmm(startMin), hhmm(endMin)]];
  }
  if (!sawTime) return null;
  // Days nobody mentioned: closed when the text was day-specific.
  for (const d of DAYS) if (!out[d]) out[d] = sawDays ? [] : out[d] ?? [];
  return out;
}

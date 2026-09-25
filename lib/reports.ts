import type { SupabaseClient } from "@supabase/supabase-js";
import { toCsv } from "./csv";
import { monthStartIso } from "./format";
import { LANGUAGE_LABEL, type Lang } from "./language";
import type { BotWithOrg } from "./types";

export type Report = {
  from: string;
  to: string;
  label: string;
  conversations: number;
  unique_visitors: number;
  messages: number;
  leads: number;
  handoffs: number;
  unanswered_conversations: number;
  unanswered_rate: number;
  resolved: number;
  hours_saved: number;
  top_questions: { question: string; count: number }[];
  languages: Record<string, number>;
  by_hour: number[];
};

/** "2026-09" → month range in the org timezone. */
export function monthRange(month: string, timeZone: string): { from: string; to: string; label: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  return { from: monthStartIso(`${month}-01`, timeZone), to: monthStartIso(`${next}-01`, timeZone), label };
}

export async function buildReport(db: SupabaseClient, bot: BotWithOrg, range: { from: string; to: string; label: string }): Promise<Report> {
  const { data, error } = await db.rpc("bot_report", { p_bot_id: bot.id, p_from: range.from, p_to: range.to, p_tz: bot.org.timezone });
  if (error) throw new Error(error.message);
  const r = data as Omit<Report, "from" | "to" | "label" | "unanswered_rate" | "hours_saved">;
  return {
    ...r,
    ...range,
    unanswered_rate: r.conversations ? r.unanswered_conversations / r.conversations : 0,
    // Estimated: every conversation the assistant resolved alone saved the admin-set minutes of staff time.
    hours_saved: Math.round(((r.resolved * Number(bot.org.minutes_saved_per_conversation)) / 60) * 10) / 10,
  };
}

export function reportCsv(bot: BotWithOrg, r: Report): string {
  const rows: (string | number)[][] = [
    ["Botly monthly report", bot.org.name],
    ["Period", r.label],
    [],
    ["Metric", "Value"],
    ["Conversations", r.conversations],
    ["Unique visitors", r.unique_visitors],
    ["Messages", r.messages],
    ["Leads", r.leads],
    ["Handed to a person", r.handoffs],
    ["Conversations with an unanswered question", r.unanswered_conversations],
    ["Unanswered rate", `${Math.round(r.unanswered_rate * 100)}%`],
    ["Resolved by the assistant", r.resolved],
    [`Estimated hours saved (${bot.org.minutes_saved_per_conversation} min per resolved conversation)`, r.hours_saved],
    [],
    ["Top questions", "Count"],
    ...r.top_questions.map((q) => [q.question, q.count]),
    [],
    ["Language", "Conversations"],
    ...Object.entries(r.languages).map(([k, v]) => [LANGUAGE_LABEL[k as Lang] ?? k, v]),
    [],
    ["Hour of day", "Conversations"],
    ...r.by_hour.map((n, h) => [`${String(h).padStart(2, "0")}:00`, n]),
  ];
  return toCsv(rows);
}

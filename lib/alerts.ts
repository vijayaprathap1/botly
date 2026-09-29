import { escapeHtml, sendEmail } from "./notify/email";

/**
 * Emails the platform admin about server errors (AI provider down, database errors, crashes),
 * at most once per 15 minutes per kind of error so an outage is one email, not hundreds.
 * Goes to ALERT_EMAIL, else the first ADMIN_EMAILS address. Needs RESEND_API_KEY.
 */
const lastSent = new Map<string, number>();
const WINDOW_MS = 15 * 60 * 1000;

export function alertKey(kind: string, message: string): string {
  // Numbers, ids and quoted values vary between occurrences of the same problem.
  return `${kind}:${message.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "#").replace(/\d+/g, "#").slice(0, 120)}`;
}

export async function reportError(kind: string, error: unknown, context: Record<string, string | number | undefined> = {}): Promise<boolean> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[alert:${kind}]`, message, context);
  const to = process.env.ALERT_EMAIL || (process.env.ADMIN_EMAILS ?? "").split(",")[0]?.trim();
  if (!to || !process.env.RESEND_API_KEY || process.env.BOTLY_TEST_SCRIPTED_LLM === "1") return false;
  const key = alertKey(kind, message);
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < WINDOW_MS) return false;
  lastSent.set(key, now);
  const rows = Object.entries({ ...context, time: new Date(now).toISOString() })
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `<tr><td style="color:#71717a;padding:2px 12px 2px 0">${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
    .join("");
  const r = await sendEmail({
    to,
    subject: `Botly alert: ${kind}`,
    html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;color:#18181b"><p><b>${escapeHtml(kind)}</b></p><pre style="white-space:pre-wrap;background:#f4f4f5;padding:10px;border-radius:6px">${escapeHtml(message.slice(0, 2000))}</pre><table>${rows}</table><p style="color:#71717a">Repeats of this error are muted for 15 minutes. Check ${escapeHtml(process.env.NEXT_PUBLIC_APP_URL ?? "")}/api/health?deep=1</p></div>`,
    text: `${kind}\n\n${message}\n\n${Object.entries(context).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  }).catch(() => ({ sent: false }));
  return r.sent;
}

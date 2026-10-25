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

function supabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return url.startsWith("http") && key.length > 20;
}

/** One sender across instances when migration 0011 is applied; otherwise this process's memory. */
async function claimAlert(key: string): Promise<boolean> {
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < WINDOW_MS) return false;
  if (supabaseConfigured()) {
    try {
      const { supabaseAdmin } = await import("./supabase/admin");
      const { data, error } = await supabaseAdmin().rpc("claim_slot", { p_key: `alert:${key}`.slice(0, 200), p_window_seconds: Math.floor(WINDOW_MS / 1000) });
      if (!error && typeof data === "boolean") {
        if (data) lastSent.set(key, now);
        else lastSent.set(key, now);
        return data;
      }
      if (error) console.error("[alert] claim_slot", error.message);
    } catch (e) {
      console.error("[alert] claim_slot", e instanceof Error ? e.message : e);
    }
  }
  if (now - (lastSent.get(key) ?? 0) < WINDOW_MS) return false;
  lastSent.set(key, now);
  return true;
}

export async function reportError(kind: string, error: unknown, context: Record<string, string | number | undefined> = {}): Promise<boolean> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[alert:${kind}]`, message, context);
  const to = process.env.ALERT_EMAIL || (process.env.ADMIN_EMAILS ?? "").split(",")[0]?.trim();
  if (!to || !process.env.RESEND_API_KEY || process.env.BOTLY_TEST_SCRIPTED_LLM === "1") return false;
  const key = alertKey(kind, message);
  const now = Date.now();
  if (!(await claimAlert(key))) return false;
  const rows = Object.entries({ ...context, time: new Date(now).toISOString() })
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `<tr><td style="color:#71717a;padding:2px 12px 2px 0">${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
    .join("");
  const r = await sendEmail({
    to,
    subject: `Botly alert: ${kind}`,
    html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;color:#18181b"><p><b>${escapeHtml(kind)}</b></p><pre style="white-space:pre-wrap;background:#f4f4f5;padding:10px;border-radius:6px">${escapeHtml(message.slice(0, 2000))}</pre><table>${rows}</table><p style="color:#71717a">Repeats of this error are muted for 15 minutes. Check ${escapeHtml(process.env.NEXT_PUBLIC_APP_URL ?? "")}/api/health (a live model check is /api/health?deep=1 with the cron secret, or while signed in as admin).</p></div>`,
    text: `${kind}\n\n${message}\n\n${Object.entries(context).map(([k, v]) => `${k}: ${v}`).join("\n")}`,
  }).catch(() => ({ sent: false }));
  return r.sent;
}

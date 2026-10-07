/**
 * One look for every email Botly sends. Each message chooses the blocks that suit it
 * (a badge, an action button, a facts panel, numbered next steps) instead of all mail
 * being the same paragraph-and-link.
 *
 * Email clients are not browsers: this is table layout with inline styles only, no
 * web fonts, no external images (the mark is drawn with a table cell), so it renders
 * the same in Gmail, Outlook, Apple Mail and on phones, and nothing is blocked by
 * "images off". The sign-in templates in supabase/templates/ are generated from this
 * file (Supabase renders those itself, so they are static HTML with {{ }} variables).
 */
const INK = "#0f172a";
const BODY = "#334155";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const CANVAS = "#f1f5f9";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Accent per kind of message, so the inbox reads at a glance. */
const TONES = {
  brand: { solid: "#4f46e5", dark: "#3730a3", soft: "#eef2ff", text: "#3730a3" },
  success: { solid: "#059669", dark: "#047857", soft: "#ecfdf5", text: "#065f46" },
  warning: { solid: "#d97706", dark: "#b45309", soft: "#fffbeb", text: "#92400e" },
  danger: { solid: "#dc2626", dark: "#b91c1c", soft: "#fef2f2", text: "#991b1b" },
} as const;
export type Tone = keyof typeof TONES;

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type BrandEmail = {
  tone?: Tone;
  /** Shown in the inbox list after the subject; never visible in the body. */
  preheader?: string;
  /** Small label above the heading, e.g. "Secure sign-in", "New lead". */
  eyebrow?: string;
  /** One character or emoji drawn in the round badge (text, so it never gets blocked). */
  badge?: string;
  heading: string;
  /** Plain paragraphs (escaped here). */
  paragraphs?: string[];
  /** The one thing we want the reader to do. */
  cta?: { label: string; url: string };
  /** Extra links beside the main button (e.g. WhatsApp, Call). */
  secondary?: { label: string; url: string }[];
  /** A boxed list of facts: label → value. */
  panel?: { title?: string; rows: [string, string][] };
  /** Numbered "what happens next". */
  steps?: { title?: string; items: string[] };
  /** Big numbers side by side, e.g. replies used / days left. */
  stats?: { value: string; label: string }[];
  /** Small grey text at the bottom of the card, e.g. expiry or "ignore if this wasn't you". */
  note?: string;
  /** Print the button's address under it, for clients that strip buttons. */
  showLink?: boolean;
  /** Trusted HTML placed after the paragraphs (already escaped by the caller). */
  bodyHtml?: string;
  /** Footer line under the brand line, e.g. why the reader got this email. */
  reason?: string;
};

export function brandEmail(e: BrandEmail): { html: string; text: string } {
  const t = TONES[e.tone ?? "brand"];
  const para = (e.paragraphs ?? []).map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:${BODY}">${escapeHtml(l)}</p>`).join("");

  const badge = e.badge
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px"><tr><td width="52" height="52" align="center" valign="middle" style="width:52px;height:52px;border-radius:14px;background:${t.soft};font-size:24px;line-height:52px;color:${t.text}">${e.badge}</td></tr></table>`
    : "";
  const eyebrow = e.eyebrow ? `<p style="margin:0 0 8px;font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${t.solid}">${escapeHtml(e.eyebrow)}</p>` : "";

  const stats = e.stats?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px"><tr>${e.stats
        .map(
          (s, i) =>
            `<td valign="top" style="padding:14px 16px;background:${t.soft};border-radius:12px;${i ? "" : ""}"><div style="font-size:24px;line-height:30px;font-weight:700;color:${INK};letter-spacing:-0.02em">${escapeHtml(s.value)}</div><div style="font-size:12.5px;line-height:18px;color:${MUTED}">${escapeHtml(s.label)}</div></td>${i < e.stats!.length - 1 ? '<td width="10" style="width:10px;font-size:0;line-height:0">&nbsp;</td>' : ""}`,
        )
        .join("")}</tr></table>`
    : "";

  const button = e.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px"><tr><td align="center" bgcolor="${t.solid}" style="border-radius:10px;background:${t.solid};background-image:linear-gradient(135deg,${t.solid},${t.dark})"><a href="${escapeHtml(e.cta.url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(e.cta.label)} &rarr;</a></td>${(e.secondary ?? [])
        .map((s) => `<td width="10" style="width:10px">&nbsp;</td><td align="center" style="border-radius:10px;border:1px solid ${LINE};background:#ffffff"><a href="${escapeHtml(s.url)}" target="_blank" style="display:inline-block;padding:13px 20px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:${INK};text-decoration:none;border-radius:10px">${escapeHtml(s.label)}</a></td>`)
        .join("")}</tr></table>`
    : "";
  const rawLink =
    e.cta && e.showLink
      ? `<p style="margin:14px 0 0;font-size:12.5px;line-height:19px;color:${MUTED}">Button not working? Copy this link into your browser:<br><a href="${escapeHtml(e.cta.url)}" style="color:${t.solid};word-break:break-all">${escapeHtml(e.cta.url)}</a></p>`
      : "";

  const panel = e.panel
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;background:#f8fafc;border:1px solid ${LINE};border-radius:12px"><tr><td style="padding:16px 18px">${
        e.panel.title ? `<div style="margin:0 0 8px;font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED}">${escapeHtml(e.panel.title)}</div>` : ""
      }<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${e.panel.rows
        .map(([k, v]) => `<tr><td valign="top" style="padding:5px 14px 5px 0;font-size:13.5px;line-height:20px;color:${MUTED};white-space:nowrap">${escapeHtml(k)}</td><td valign="top" style="padding:5px 0;font-size:13.5px;line-height:20px;color:${INK};font-weight:600">${escapeHtml(v)}</td></tr>`)
        .join("")}</table></td></tr></table>`
    : "";

  const steps = e.steps?.items.length
    ? `<div style="margin:24px 0 0">${e.steps.title ? `<div style="margin:0 0 10px;font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED}">${escapeHtml(e.steps.title)}</div>` : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${e.steps.items
        .map(
          (s, i) =>
            `<tr><td width="34" valign="top" style="width:34px;padding:0 0 10px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="24" height="24" align="center" style="width:24px;height:24px;border-radius:12px;background:${t.soft};font-size:12px;line-height:24px;font-weight:700;color:${t.text}">${i + 1}</td></tr></table></td><td valign="top" style="padding:2px 0 10px;font-size:14.5px;line-height:22px;color:${BODY}">${escapeHtml(s)}</td></tr>`,
        )
        .join("")}</table></div>`
    : "";

  const note = e.note ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0"><tr><td style="border-top:1px solid ${LINE};padding:16px 0 0;font-size:12.5px;line-height:19px;color:${MUTED}">${escapeHtml(e.note)}</td></tr></table>` : "";

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${escapeHtml(e.heading)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:${FONT};-webkit-font-smoothing:antialiased">
${e.preheader ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeHtml(e.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS}"><tr><td align="center" style="padding:36px 14px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="padding:0 6px 20px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="34" height="34" align="center" style="width:34px;height:34px;border-radius:10px;background:#4f46e5;background-image:linear-gradient(135deg,#6366f1,#4338ca);color:#ffffff;font-size:17px;line-height:34px;font-weight:800">B</td>
<td style="padding-left:11px;font-size:19px;line-height:34px;font-weight:800;color:${INK};letter-spacing:-0.02em">Botly</td>
</tr></table></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:18px;overflow:hidden">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="5" bgcolor="${t.solid}" style="height:5px;font-size:0;line-height:0;background:${t.solid};background-image:linear-gradient(90deg,${t.solid},${t.dark});border-radius:18px 18px 0 0">&nbsp;</td></tr>
<tr><td style="padding:34px 34px 32px">
${badge}${eyebrow}<h1 style="margin:0 0 14px;font-size:24px;line-height:31px;font-weight:800;color:${INK};letter-spacing:-0.025em">${escapeHtml(e.heading)}</h1>
${para}${stats}${e.bodyHtml ?? ""}${button}${rawLink}${panel}${steps}${note}
</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:22px 12px 0;font-size:12.5px;line-height:20px;color:${MUTED}">
<a href="https://botly.in" style="color:${MUTED};text-decoration:none;font-weight:600">botly.in</a> &nbsp;&middot;&nbsp; <a href="mailto:support@botly.in" style="color:${MUTED};text-decoration:none">support@botly.in</a> &nbsp;&middot;&nbsp; <a href="https://botly.in/privacy-policy" style="color:${MUTED};text-decoration:none">Privacy</a>
<br>Botly &mdash; the AI assistant that answers your website visitors.${e.reason ? `<br>${escapeHtml(e.reason)}` : ""}
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    e.heading.toUpperCase(),
    "",
    ...(e.paragraphs ?? []),
    ...(e.stats?.length ? ["", ...e.stats.map((s) => `${s.value} ${s.label}`)] : []),
    ...(e.cta ? ["", `${e.cta.label}: ${e.cta.url}`] : []),
    ...(e.secondary ?? []).map((s) => `${s.label}: ${s.url}`),
    ...(e.panel ? ["", ...(e.panel.title ? [e.panel.title] : []), ...e.panel.rows.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(e.steps ? ["", ...(e.steps.title ? [e.steps.title] : []), ...e.steps.items.map((s, i) => `${i + 1}. ${s}`)] : []),
    ...(e.note ? ["", e.note] : []),
    "",
    "Botly · https://botly.in · support@botly.in",
    ...(e.reason ? [e.reason] : []),
  ].join("\n");
  return { html, text };
}

/**
 * One look for every email Botly sends: wordmark, a short message, at most one button,
 * a quiet footer. Table layout with inline styles so it renders the same in Gmail,
 * Outlook and on phones. The sign-in templates in supabase/templates/ use the same
 * markup (Supabase renders those itself, so they are static HTML).
 */
const BRAND = "#4f46e5";
const INK = "#18181b";
const MUTED = "#71717a";

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type BrandEmail = {
  /** Shown in the inbox list after the subject; never visible in the body. */
  preheader?: string;
  heading: string;
  /** Plain paragraphs (escaped here). */
  paragraphs?: string[];
  /** Trusted HTML placed after the paragraphs (already escaped by the caller). */
  bodyHtml?: string;
  cta?: { label: string; url: string };
  /** Small grey text under the button, e.g. expiry or "ignore if this wasn't you". */
  note?: string;
};

export function brandEmail(e: BrandEmail): { html: string; text: string } {
  const p = (e.paragraphs ?? []).map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:24px;color:${INK}">${escapeHtml(l)}</p>`).join("");
  const button = e.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px"><tr><td style="border-radius:8px;background:${BRAND}"><a href="${escapeHtml(e.cta.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(e.cta.label)}</a></td></tr></table>`
    : "";
  const note = e.note ? `<p style="margin:18px 0 0;font-size:13px;line-height:20px;color:${MUTED}">${escapeHtml(e.note)}</p>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(e.heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
${e.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(e.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="padding:0 4px 18px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="width:30px;height:30px;border-radius:8px;background:${BRAND};color:#ffffff;font-size:16px;font-weight:700;text-align:center;line-height:30px">B</td>
<td style="padding-left:10px;font-size:17px;font-weight:700;color:${INK};letter-spacing:-0.01em">Botly</td>
</tr></table></td></tr>
<tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:14px;padding:32px 28px">
<h1 style="margin:0 0 14px;font-size:21px;line-height:28px;font-weight:700;color:${INK};letter-spacing:-0.02em">${escapeHtml(e.heading)}</h1>
${p}${e.bodyHtml ?? ""}${button}${note}
</td></tr>
<tr><td style="padding:18px 4px 0;font-size:12px;line-height:18px;color:${MUTED}">Botly · AI assistant for your website · <a href="https://botly.in" style="color:${MUTED}">botly.in</a><br>Need help? Just reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [e.heading, "", ...(e.paragraphs ?? []), ...(e.cta ? ["", `${e.cta.label}: ${e.cta.url}`] : []), ...(e.note ? ["", e.note] : []), "", "Botly · botly.in"].join("\n");
  return { html, text };
}

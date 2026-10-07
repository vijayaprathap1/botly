/**
 * Writes the HTML for Supabase's own auth emails (Authentication → Emails → Templates),
 * from the same layout as every other Botly email. Supabase fills the {{ … }} variables.
 *   npx tsx scripts/gen-auth-emails.ts
 * Then paste each file into the matching template in the Supabase dashboard.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { brandEmail } from "../lib/notify/layout";

// Supabase template variables must reach the output unescaped.
const LINK = "__CONFIRM_LINK__";
const link = (type: string) => `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}&amp;redirect_to={{ .RedirectTo }}`;

const templates: Record<string, { subject: string; type: string; heading: string; paragraphs: string[]; cta: string; preheader: string }> = {
  "magic-link": {
    subject: "Sign in to Botly",
    type: "email",
    preheader: "Your sign-in link for Botly. It works once and expires in 1 hour.",
    heading: "Sign in to Botly",
    paragraphs: ["Press the button to sign in to your Botly dashboard. No password needed."],
    cta: "Sign in to Botly",
  },
  "confirm-signup": {
    subject: "Welcome to Botly: confirm your email",
    type: "email",
    preheader: "Confirm your email to set up your AI assistant. The link expires in 1 hour.",
    heading: "Welcome to Botly",
    paragraphs: ["Confirm your email to create your account. Next you'll tell us about your business and we'll build your website assistant in a few minutes."],
    cta: "Confirm and continue",
  },
  invite: {
    subject: "You've been invited to Botly",
    type: "invite",
    preheader: "Accept your invitation to the Botly dashboard.",
    heading: "You're invited to Botly",
    paragraphs: ["You've been given access to a Botly assistant dashboard: conversations, leads and reports for your business."],
    cta: "Accept the invitation",
  },
};

mkdirSync("supabase/templates", { recursive: true });
for (const [name, t] of Object.entries(templates)) {
  const { html } = brandEmail({
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: t.paragraphs,
    cta: { label: t.cta, url: LINK },
    note: "This link works once and expires in 1 hour. If you didn't ask for it, you can safely ignore this email; nobody can sign in without it.",
  });
  writeFileSync(`supabase/templates/${name}.html`, html.replaceAll(LINK, link(t.type)) + "\n");
  console.log(`supabase/templates/${name}.html  ← subject: ${t.subject}`);
}

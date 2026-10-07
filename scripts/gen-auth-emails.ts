/**
 * Writes the HTML for Supabase's own auth emails (Authentication → Emails → Templates),
 * from the same layout as every other Botly email. Supabase fills the {{ … }} variables.
 *   npx tsx scripts/gen-auth-emails.ts
 * Then paste each file into the matching template in the Supabase dashboard and set its subject.
 *
 * Every link goes to /auth/confirm on Botly's own domain with the token hash. That page
 * only uses the token when the person presses its button, so the link works on any device
 * and mail scanners that open links can't use it up (the default {{ .ConfirmationURL }}
 * fails on both counts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { brandEmail, type BrandEmail } from "../lib/notify/layout";

// Supabase template variables must reach the output unescaped.
const LINK = "https://link.invalid/__CONFIRM__";
const link = (type: string) => `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}&amp;redirect_to={{ .RedirectTo }}`;
const SAFETY = "Didn't ask for this? You can safely ignore this email. Nobody can get into your account without this link, and it stops working after one use.";

const templates: Record<string, { subject: string; type: string; email: BrandEmail }> = {
  "magic-link": {
    subject: "Sign in to Botly",
    type: "email",
    email: {
      tone: "brand",
      badge: "&#128272;",
      eyebrow: "Secure sign-in",
      preheader: "Your one-time sign-in link for Botly. It expires in 1 hour.",
      heading: "Sign in to Botly",
      paragraphs: ["Press the button to open your Botly dashboard. There's no password to remember: this link is your key."],
      cta: { label: "Sign in to Botly", url: LINK },
      showLink: true,
      panel: {
        title: "About this link",
        rows: [
          ["Requested for", "{{ .Email }}"],
          ["Valid for", "1 hour, one use only"],
          ["Works on", "Any device or browser"],
        ],
      },
      note: SAFETY,
      reason: "You're getting this because someone entered this address on botly.in.",
    },
  },
  "confirm-signup": {
    subject: "Welcome to Botly — confirm your email",
    type: "email",
    email: {
      tone: "brand",
      badge: "&#128075;",
      eyebrow: "Welcome",
      preheader: "Confirm your email and your website assistant is about five minutes away.",
      heading: "Let's build your AI assistant",
      paragraphs: ["Confirm your email to create your Botly account. Your website assistant is about five minutes away."],
      cta: { label: "Confirm and get started", url: LINK },
      showLink: true,
      steps: {
        title: "What happens next",
        items: [
          "Tell us about your business: your website, what you sell, how customers reach you.",
          "Botly reads it and writes your assistant's knowledge, FAQs and greeting.",
          "Try it, then paste one line of code on your website. Free for 14 days, no card needed.",
        ],
      },
      note: SAFETY,
      reason: "You're getting this because someone signed up on botly.in with this address ({{ .Email }}).",
    },
  },
  invite: {
    subject: "You've been invited to Botly",
    type: "invite",
    email: {
      tone: "brand",
      badge: "&#9993;",
      eyebrow: "You're invited",
      preheader: "Accept your invitation to the Botly dashboard.",
      heading: "You've been invited to Botly",
      paragraphs: ["You've been given access to a Botly assistant dashboard: conversations with website visitors, leads and reports for your business."],
      cta: { label: "Accept the invitation", url: LINK },
      showLink: true,
      panel: { title: "Your access", rows: [["Email", "{{ .Email }}"], ["Password", "None needed"]] },
      note: SAFETY,
    },
  },
};

mkdirSync("supabase/templates", { recursive: true });
for (const [name, t] of Object.entries(templates)) {
  const { html } = brandEmail(t.email);
  writeFileSync(`supabase/templates/${name}.html`, html.replaceAll(LINK, link(t.type)) + "\n");
  console.log(`supabase/templates/${name}.html  ← subject: ${t.subject}`);
}

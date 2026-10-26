# How established SaaS companies design sign-in and onboarding emails (as of October 2026)

Reader notes on evidence quality:
- "Verified" below means I fetched the page and read the content through a summarising fetch tool. "Search snippet" means the claim came from a search-result summary and the page itself was not opened; treat those as lower confidence.
- I could not open any real inbox, Really Good Emails, Mailcharts or Mobbin captures first-hand. Real-product sender addresses in particular are mostly unverified (see Gaps in section 1).
- Sequenzy (sequenzy.com) is an email-tool vendor whose blog and example gallery surfaced heavily in search. Its gallery of real subject lines is useful primary-ish data; its "playbook" advice is vendor opinion with no cited statistics.

## 1. How well-known products structure magic-link / verification-code emails

### Takeaway
The dominant pattern is a very short, single-purpose email: subject of the form "Sign in to {Brand}" or "Your {Brand} login code [is 123456]", one credential (a button, a 6-digit code, or both), an expiry line and an "ignore this if you didn't ask" line. Codes (alone or alongside a link) are now at least as common as link-only emails, and Supabase itself recommends a code or an intermediate confirm page because mail scanners can pre-click and burn one-time links.

### Cited Findings
Subject lines actually in use (gallery of 27 captured SaaS login emails; capture dates not shown on the page, so age is unknown):
- Action + brand, link-style: "Sign in to Miro", "Sign in to Perplexity", "Sign in to Kestroll", "Login to Descript", "Login to Diode Computers, Inc.", "Your Voker magic link", "Sign in with Prose" — [Sequenzy SaaS magic link examples](https://www.sequenzy.com/email-examples/saas-magic-link)
- Brand + "code", code not in subject: "Your temporary Notion login code", "Your Notion signup code", "Your Undermind sign-in code", "Your MinusX Login Code", "Intuned Login Code", "Your Egoist login code", "Your login code" (Circleback) — [Sequenzy SaaS magic link examples](https://www.sequenzy.com/email-examples/saas-magic-link)
- Code placed in the subject line: "Your Reflect one-time login code is 356456", "Your one-time code for Thunder Compute is 630367", "722785 is your sync. labs verification code", "Your OneCLI code is 036556", "Your login code to VEED: 58242" — [Sequenzy SaaS magic link examples](https://www.sequenzy.com/email-examples/saas-magic-link)
- Request-framed: "Your login request to AssemblyAI", "Your login request to Confido" — [Sequenzy SaaS magic link examples](https://www.sequenzy.com/email-examples/saas-magic-link)
- Localised example exists in the wild (Spanish, code in subject): "Tu código de verificación para iniciar sesión en Coderhouse es 677859" — [Sequenzy SaaS magic link examples](https://www.sequenzy.com/email-examples/saas-magic-link)
- Tally of that 27-email sample by my count of the listing: roughly 15 code-centred, 4 link-only, 5 link-or-code, 3 unspecified. The gallery's own summary says Notion, Perplexity and Mobbin provide both a link and a code; Framer, Miro, Kestroll, Voker, Alloy, AssemblyAI and Notability centre a one-click link; Veed, CARFAX, Descript, sync. and MinusX centre a code (search snippet of the same site; note it classifies Miro/AssemblyAI slightly differently from the listing page) — [Sequenzy magic link examples](https://www.sequenzy.com/email-examples/magic-link)
- The gallery characterises the genre as "short, access-focused messages over promotion. Plain text, one CTA, expiring credentials, and security reminders recur"; several state the credential expires soon and several tell recipients to ignore the message if they did not request it (search snippet + fetched page) — [Sequenzy SaaS magic link examples](https://www.sequenzy.com/email-examples/saas-magic-link)

Product-specific facts:
- Slack (old example, 2017): confirmation emails arrived from "feedback@slack.com" with subject "Confirm your email address" and a click-to-proceed link. This is a nine-year-old mailing-list archive and should not be assumed current (search snippet) — [LACNIC list archive, April 2017](https://mail.lacnic.net/pipermail/ietf-lac/2017-April/001143.html)
- Slack's current help centre refers to a "Confirm your new email address" email for address changes (search snippet) — [Slack help: change your email address](https://slack.com/intl/en-in/help/articles/207262907-Change-your-email-address)
- Linear added email magic-link login in May 2020 (changelog entry; the email itself was not viewable) — [Linear changelog 2020-05-18](https://linear.app/changelog/2020-05-18-login-with-email-magic-links)
- Clerk: email verification code is enabled by default, with email verification link as the alternative; system emails are customisable through a template system with variables (search snippet) — [Clerk docs: email options (staging mirror)](https://clerkstage.dev/docs/authentication/configuration/email-options)
- Supabase: `{{ .Token }}` "Contains a 6-digit One-Time-Password (OTP) that can be used instead of the `{{ .ConfirmationURL }}`", so one template can carry both a button and a code — [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- Supabase warns: "Certain email providers may have spam detection or other security features that prefetch URL links from incoming emails", which consumes the token before the user clicks. Its two fixes: "Use an email OTP instead by including `{{ .Token }}` in the email template", or "Create your own custom email link to redirect the user to a page where they can click on a button to confirm the action" (built from `{{ .TokenHash }}`) — [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- Supabase also says "We recommend disabling email tracking to ensure email links are not overwritten" (click tracking rewrites the sign-in URL) — [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)

Sender name and reply handling (authoritative guidance rather than observed headers):
- Postmark: "Use the name of the application/company that sent the email"; "Avoid using the name of a specific person within the company if you can"; "Avoid a noreply@ address if you can" because "A noreply email address is a quick way to signal to customers that you don't want to hear from them"; route replies with a reply-to header to a monitored inbox if the From address is not monitored — [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices)
- Gmail: "Messages of the same category should have the same From: email address" — [Google email sender guidelines](https://support.google.com/a/answer/81126)
- Resend lists "using a generic sender" among common reasons mail lands in spam (search snippet) — [Resend: explore sending features](https://resend.com/docs/explore-sending-features)

### Inferences
- Recommended skeleton for Botly's sign-in email (my synthesis of the above): logo at top; one sentence ("Tap the button to sign in to Botly"); one primary button; the 6-digit code beneath as a fallback ("or enter this code"); plain fallback URL; precise expiry; one-line security note ("If you didn't request this, you can ignore this email — nobody can sign in without it"); small footer with legal name, address and support address. No marketing content, no social icons, no secondary links.
- Sending both a button and a 6-digit code is the safest choice for Botly: Indian small-business owners often request the link on a laptop and open mail on a phone (cross-device), and a code survives link pre-fetching. Supabase already generates both in the same payload, so the cost is only a code-entry field on the login page.
- Sender format inference: "Botly <login@mail.botly.example>" or "Botly <hello@...>" with Reply-To set to a monitored support inbox. Brand name alone as display name is the norm for auth mail; person-named senders ("Priya from Botly") belong to onboarding mail, not auth mail.
- From memory (not verified in this session, do not quote as fact): Notion, Linear, Vercel and Figma auth emails are minimal single-column layouts with a small logo, a short heading, one button or a large monospaced code, and a grey footer line; Notion uses a "Notion Team" display name on a mail subdomain. The requester's own example "Notion Team <notify@mail.notion.so>" matches my recollection but I could not confirm it.

### Gaps
- Could not verify first-hand the current sender address, display name, preheader or exact body copy for Slack, Notion, Linear, Vercel, Stripe, Figma, Supabase, Clerk, Resend, Loom, Razorpay, Zoho or Freshworks. Search engines do not index inbox headers and I had no inbox access. A cheap fix: the owner signs up to 5-6 of these with a test address and saves the raw emails; that gives exact From, Reply-To, preheader and HTML.
- No verified examples from the Indian products requested (Razorpay, Zoho, Freshworks).
- Exact expiry wording per product not captured. The gallery only says expiry statements "recur".
- Really Good Emails, Mailcharts and Mobbin were not opened.

## 2. Best practices for transactional auth emails

### Takeaway
Keep it expected, immediate, single-action and plain; put the essential information in a subject of about 50 characters or fewer; always ship a matching plain-text part; state expiry precisely; and keep link tracking off for sign-in links.

### Cited Findings
- Good transactional emails are expected (recipient-triggered), timely (sent immediately), actionable (one clear call to action) and plain (minimal design, content over decoration) (search snippet of Postmark's published skill/guide) — [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices)
- Subject length: "Fifty characters or fewer is a good guideline for length"; "Simple and direct wins over cute and catchy"; put the meaningful words first — [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices)
- "Convey all the relevant information in your subject line so the recipient doesn't even need to open the email" — this is the reasoning behind code-in-subject designs — [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices)
- Preheader: use it to carry useful content that does not fit in the subject — [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices)
- Plain text: "Make sure the plain text content doesn't vary too much from the HTML content"; keep links short and on their own lines; use hyphen/equals dividers and paragraphs — [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices)
- A missing plain-text version is listed by Resend among common reasons for spam placement, alongside unverified domain and generic sender (search snippet) — [Resend: explore sending features](https://resend.com/docs/explore-sending-features)
- Expiry wording: "Being extremely precise will work in your favour, especially when you are sending out a password reset email or a magic link with specific expiration dates and times"; avoid relative markers such as "today" or "a few moments ago" — [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices)
- Authentication: SPF, DKIM, DMARC and a custom Return-Path — [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices). Gmail requires SPF or DKIM for all senders, TLS, valid PTR records, and spam rate under 0.3% in Postmaster Tools; bulk senders (5,000+/day) need SPF and DKIM and DMARC with From-domain alignment — [Google email sender guidelines](https://support.google.com/a/answer/81126)
- Link scanners can pre-fetch and consume one-time links; mitigate with a code or an interstitial confirm page; disable click tracking on auth mail — [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- Localisation: Supabase's Send Email Hook docs show storing a language preference in `user_metadata` and choosing translated subject lines and HTML per locale (their example uses English, Spanish and French) — [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- Gmail clips HTML bodies over about 102 KB, showing a "View entire message" link and possibly breaking layout; the limit counts HTML source (tags, inline CSS, comments, tracking pixels, base64-inlined images) and not attachments or remotely hosted images (search snippet) — [Really Good Emails: email size and Gmail clipping](https://support.reallygoodemails.com/hc/en-us/articles/24963912931602-Email-Size-Gmail-Clipping)

### Inferences
- Code in the subject line: trade-off, not a rule. For: usable from a lock-screen notification without opening. Against: the code is visible on a locked phone and in notification previews, and every email has a unique subject so Gmail will not thread them (which is arguably good). In the sample in section 1 both styles are common. For Botly, where the primary action is a button, "Sign in to Botly" is the cleaner subject; if the product moves to code-first, "Your Botly code is 123456" is defensible. (Security weighting here is my judgement; I found no authoritative source ruling either way.)
- Suggested copy set for Botly: Subject "Sign in to Botly"; preheader "This link expires in 60 minutes and can be used once."; expiry stated as a duration matching the real Supabase OTP expiry setting, since an absolute timestamp needs the user's timezone (IST is a safe default for an India-only audience, but a duration avoids the problem).
- Spam-trigger avoidance for auth mail, practical list: verified sending domain with DKIM alignment, text part present, no URL shorteners, link domain matching the From domain, no click/open tracking, no images beyond a small hosted logo, no promotional copy. (Assembled from the Resend, Supabase and Postmark points above.)
- Dark mode, mobile and accessibility guidance was not sourced in this session beyond React Email's tooling (section 4). Standard practice from my own knowledge, unverified here: single column around 600 px max width; body text 16 px; button at least 44 px tall with real text, not an image; logo as a transparent PNG that survives a dark background (or with a light padding plate); `alt` text on the logo; `lang` attribute on the html element (important once Tamil/Hindi ship); sufficient colour contrast; do not rely on colour inversion being consistent across clients.
- India localisation: English first is consistent with every example found. When Tamil/Hindi are added, key the template on a stored locale (the Supabase hook pattern above), translate the subject and preheader too, and test that the chosen web font fallback renders Tamil and Devanagari, since email clients mostly ignore web fonts and use system fonts.

### Gaps
- No authoritative source found in this session on dark-mode behaviour per client, minimum tap-target sizes, or WCAG guidance specific to email; the points above are from general knowledge.
- No authoritative source found on whether putting OTPs in subject lines is discouraged on security grounds.
- No data found on language preference for transactional email among Indian small-business owners.

## 3. Onboarding sequence after sign-up, and transactional vs marketing

### Takeaway
A small product needs roughly six to eight emails across a 14-day trial, driven by behaviour (has the assistant been built? installed? used?) rather than the calendar alone, with trial reminders at about 3 days and 1 day before expiry and one follow-up after. Product-triggered notices can go on the transactional stream; nudges and tips are marketing mail that needs consent, an unsubscribe link and ideally a separate subdomain.

### Cited Findings
Sequence patterns:
- One published 14-day framework sends five emails on Day 0, 3, 7, 11 and 13, each naming the concrete trial end date; another sends Immediate ("Your 14-day trial starts now"), Day 1, Day 3, Day 7 ("Halfway check-in") and Day 12 ("2 days left: need more time?") (search snippet, vendor and template sources) — [Sequenzy: onboarding email sequence examples](https://www.sequenzy.com/blog/onboarding-email-sequence-examples)
- A behaviour-split version: Day 0 welcome with one primary CTA (example subject "Start here: create your first workflow"); Day 1 split by whether the first setup step was done (inactive example: "The simplest first step is still worth doing"); Day 3 friction removal; Day 7 value proof for activated users or recovery for non-activated; Day 14 convert ("Upgrade to keep it running"), guide to the missing step, or ask for feedback. The page cites no statistics; it is the author's framework — [Sequenzy: SaaS onboarding emails playbook](https://www.sequenzy.com/blog/saas-onboarding-emails-playbook)
- Systems should check for an upgrade before each send after the welcome and exit the flow if the user has converted (search snippet) — [Salesmate: 14 days SaaS trial workflow](https://support.salesmate.io/hc/en-us/articles/42342694768537-14-Days-Saas-Trial)
- Trial-ending timing: first reminder 3 days before expiry and a second 24 hours before, because a single last-minute email compresses the decision window; some send at 7, 3 and 1 days (search snippet) — [Bento: trial expiration email best practices](https://bentonow.com/posts/trial-expiration-email-best-practices); [Encharge: trial expiration templates](https://encharge.io/trial-expiration-email-templates/)
- Trial-ending content: exact end date, what is kept (data, settings) and what changes on expiry, pricing context ("even a starting price reduces uncertainty"), upgrade button front and centre (search snippet) — [Sequenzy: free trial expiring email sequence](https://www.sequenzy.com/blog/free-trial-expiring-email-sequence)
- Trial-ending subject examples: "Your [Product] trial ends tomorrow", "48 hours left in your [Product] trial", "Your {{product_name}} trial ends in {{days_left}} days", "Trial ending {{trial_end_date}} — here's what happens next" (search snippet; templates, not captured from named products) — [Userlist: trial expiration emails](https://userlist.com/blog/trial-expiration-emails-saas/); [Sequenzy trial conversion templates](https://www.sequenzy.com/templates/saas-trial-conversion-email-templates)
- Post-expiry: one more email 1-2 days after expiry, framed as "we saved your data" / "your account is ready when you are" (search snippet) — [Bento: trial expiration email best practices](https://bentonow.com/posts/trial-expiration-email-best-practices)

Transactional vs marketing:
- Resend: transactional emails (account confirmations, password resets, real-time notifications) vs marketing emails (newsletters, promotional campaigns) sent through Broadcasts and Audiences (search snippet) — [Resend: email types](https://www.resend.com/docs/email-types)
- Resend: "Transactional emails are generally exempt from including an unsubscribe link"; but "tell recipients how to opt out of receiving future email from you if the content is more related to nurturing relationships with your customers, rather than pragmatic, action-oriented emails" — [Resend: should I add an unsubscribe link](https://resend.com/docs/knowledge-base/should-i-add-an-unsubscribe-link.md)
- With Resend Broadcasts or Automations, unsubscribes are handled automatically once `{{{RESEND_UNSUBSCRIBE_URL}}}` is included (search snippet) — [Resend: should I add an unsubscribe link](https://resend.com/docs/knowledge-base/should-i-add-an-unsubscribe-link.md)
- Gmail: for bulk senders "Marketing messages and subscribed messages must support one-click unsubscribe" plus a clearly visible unsubscribe link in the body; one-click unsubscribe is not required for transactional messages such as password resets (search snippet for the exemption) — [Google email sender guidelines](https://support.google.com/a/answer/81126); [Suped summary](https://www.suped.com/email-deliverability/answers/how-to-comply-with-gmails-new-sending-rules-for-bulk-email-sender)
- Gmail does not itself define the category: its FAQ says "Message recipients, not Google, determine the nature of the messages they receive" (search snippet) — [Validity: Gmail and Yahoo sender requirements Q&A](https://www.validity.com/blog/gmail-yahoos-new-sender-requirements-answering-the-big-remaining-questions/)
- Separation: "Never mix transactional and broadcast email in the same sending stream" (search snippet); "Ideally, you'd have two separate sending infrastructures that include a unique IP address and subdomain" — [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices)
- Resend recommends sending from a subdomain (e.g. notifications.acme.com, updates.example.com) rather than the root domain, for "Reputation Isolation" and "Sending Purpose Transparency" (search snippet) — [Resend: subdomain or root domain](https://resend.com/docs/knowledge-base/is-it-better-to-send-emails-from-a-subdomain-or-the-root-domain)
- India, DPDP: the DPDP Rules are phased — Data Protection Board provisions from 13 November 2025, Consent Manager provisions from 13 November 2026, and substantive Data Fiduciary obligations from 13 May 2027; withdrawing consent must be as easy as giving it (search snippet of a KPMG guidance PDF and law-firm summaries; not read in full and not legal advice) — [KPMG: DPDP Rules 2025 guidance](https://assets.kpmg.com/content/dam/kpmgsites/in/pdf/2025/11/dpdp-rules-2025-guidance-to-dpdp-act-implementation.pdf); [Rainmaker summary](https://rainmaker.co.in/reimagining-consent-in-indias-digital-age-what-the-dpdp-act-rules-2025-mean-for-data-privacy-and-compliance/)

### Inferences
Recommended minimal sequence for Botly (my synthesis; timings adapted from the frameworks above to Botly's 14-day / 50-reply trial):

| # | Email | Trigger / timing | Goal | Stream |
|---|-------|------------------|------|--------|
| 0 | Sign-in link | Every login request, immediate | Get in | Transactional |
| 1 | Welcome | First successful sign-in, immediate | One action: finish the short form. State trial terms (14 days, 50 AI replies) | Transactional (account notice) |
| 2 | "Your assistant is ready" | Build completes | Get the widget installed on the site; include embed step and a test link | Transactional (the user is waiting for it) |
| 3 | Setup nudge | 24 h after sign-up if form not completed, or 48 h after build if not installed | Remove the single blocker; offer help by reply or WhatsApp | Marketing / lifecycle |
| 4 | First value | First real visitor conversation answered (or Day 5-7 summary: "Botly answered N questions this week") | Prove value with their own numbers | Marketing / lifecycle |
| 5 | Usage warning | About 80% of the 50 replies used (40 replies) | Avoid a silent cut-off; show price in INR | Transactional (service limit notice) |
| 6 | Trial ends in 3 days | Day 11 | Exact end date, what happens to the assistant, plan price in INR, upgrade button | Transactional notice, kept free of promotional padding |
| 7 | Trial ends tomorrow | Day 13 | Same, shorter | Transactional notice |
| 8 | Trial ended / replies exhausted | Day 14 or 50th reply | Say plainly that the assistant is paused and data is kept; upgrade button | Transactional |
| 9 | Win-back / feedback | 2-3 days after expiry, non-converters only | "Your assistant is saved"; one-question feedback ask | Marketing |
| 10 | Payment receipt / GST invoice | On each successful payment | Record; amount in INR, GSTIN, invoice number | Transactional |
| 11 | Payment failed | On failure | Fix the payment method | Transactional |

- Minimum viable subset if the team can only build five: 0, 1+2 (merge welcome into "your assistant is ready" if the build finishes within minutes), 6, 8, 10.
- Every email after #1 should check state first (already installed? already paid?) and skip or switch copy, per the "exit on upgrade" rule above.
- Because the trial has two limits (days and replies), every trial email should state both remaining days and remaining replies; the reply cap may be hit well before Day 14 on a busy site, so #5 and #8 must be event-driven, not calendar-driven.
- Classification caution: trial-ending reminders are widely treated as transactional/service notices, but if they contain discount offers or feature promotion they read as marketing. Since Gmail lets recipients decide the category, the safe pattern is: service notices carry no promotion; nudges, tips and win-backs go on the marketing stream with an unsubscribe link and a consent basis.
- Consent: collect a clear, unticked-by-default or clearly worded opt-in (or at minimum a visible notice with an easy opt-out) for product tips at sign-up, and honour unsubscribes immediately. This anticipates the DPDP obligations that take full effect in May 2027.
- Practical domain layout: `mail.botly-domain` (or `auth.`) for transactional via the Resend API; `updates.botly-domain` for lifecycle/marketing via Resend Broadcasts/Automations. Different From addresses per category, per Gmail's "same category, same From" recommendation.
- Volume context: Gmail's bulk-sender tier starts at 5,000 messages/day to Gmail addresses; Botly is far below it, but configuring SPF + DKIM + DMARC now costs nothing and is what "serious product companies" do.

### Gaps
- No verified conversion statistics for any sequence design; the vendor blogs that surfaced cite none.
- Did not find an authoritative Indian legal source that classifies trial reminders or onboarding nudges as marketing vs service messages, or any India-specific unsubscribe statute for email comparable to CAN-SPAM. TRAI's commercial-communication rules cover SMS/voice; I did not verify their (non-)application to email.
- DPDP phase dates come from search summaries of secondary sources; confirm against the gazette notification before relying on them.
- Captured real onboarding sequences from named products (Userlist/Userpilot/Appcues teardowns) were not opened.

## 4. Tooling for building emails in a React/Next.js codebase

### Takeaway
React Email plus Resend is the standard pairing (same company builds both, and Supabase's official example uses exactly this stack through its Send Email Hook). As of 2026 React Email is at v6 with a single `react-email` package, Tailwind v4 support, a preview UI with dark-mode emulation and a client-compatibility checker.

### Cited Findings
- React Email 6.0.0 (16 April 2026) unified all components and rendering utilities into the single `react-email` package, removing the need for `@react-email/components` and individual packages — [React Email changelog](https://react.email/docs/changelog.md)
- The preview server package was renamed from `@react-email/preview-server` to `@react-email/ui` at 6.0.0, and gained a "copy toolbar insights for AI" feature — [React Email changelog](https://react.email/docs/changelog.md)
- Tailwind: support updated to Tailwind v4 in November 2025; use the `Tailwind` wrapper component with `pixelBasedPreset` because email clients do not support rem units (second point is a search snippet from a React Email skill description) — [React Email changelog](https://react.email/docs/changelog.md); [Resend react-email skill listing](https://www.skills.sh/resend/react-email/react-email)
- Plain text: the `plainText` render option was deprecated in favour of a standalone `toPlainText` utility (render v1.2.0, August 2025). Older tutorials showing `render(..., { plainText: true })` are out of date — [React Email changelog](https://react.email/docs/changelog.md)
- Dark mode: React Email 5.0.0 (November 2025) added a "Dark mode switcher emulating email client color inversion" in the preview UI — [React Email changelog](https://react.email/docs/changelog.md)
- The preview tooling includes compatibility checking against email-client CSS support (improved rule extraction, inline-style detection) — [React Email changelog](https://react.email/docs/changelog.md)
- Preview Server 5.0.0 added Resend Templates API integration to turn React Email templates into hosted Resend templates — [React Email changelog](https://react.email/docs/changelog.md)
- React Email Editor 1.0.0 (April 2026): an embeddable visual editor built on TipTap/ProseMirror — relevant only if Botly later lets its own customers edit emails — [React Email changelog](https://react.email/docs/changelog.md)
- Supabase publishes an official guide and example for custom auth emails with React Email and Resend via the Send Email Hook: create a function, set `RESEND_API_KEY` and `SEND_EMAIL_HOOK_SECRET` (strip the `v1,whsec_` prefix), then in Auth Hooks create a "Send Email hook" of type HTTPS pointing at the function URL (search snippet) — [Supabase: custom auth emails with React Email and Resend](https://supabase.com/docs/guides/functions/examples/auth-send-email-hook-react-email-resend)
- The hook payload contains `user` and `email_data` with `token` (6-digit code), `token_hash`, `email_action_type` (signup, invite, magiclink, recovery, email_change, reauthentication, plus notification types), `redirect_to` and `site_url`; when the hook is enabled, "Auth Hook handles email sending (SMTP not used)" — [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- The hook is an HTTPS endpoint, so it is not restricted to Supabase Edge Functions; the same docs show verifying the webhook signature and calling Resend's API (the docs also show a Postgres queue + `pg_cron` variant for deferred sending) — [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- Resend lists two ways to send Supabase auth mail: Resend as custom SMTP with Supabase's dashboard templates (simpler), or custom auth functions/hook with React Email or Resend Templates (more control) (search snippet) — [Resend: getting started with Resend and Supabase](https://resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase)
- Resend Broadcasts: marketing sends to Audiences from a no-code editor or the Broadcast API, with contact management, performance tracking and a customisable unsubscribe page; Resend also has "Automations" and "Topics" (search snippet) — [Resend: email types](https://www.resend.com/docs/email-types); [Resend: unsubscribe page](https://resend.com/docs/dashboard/settings/unsubscribe-page)
- Resend offers "Deliverability Insights" with suggestions based on the email's setup (search snippet) — [Resend: explore sending features](https://resend.com/docs/explore-sending-features)
- Gmail clipping at about 102 KB of HTML applies to Gmail only; Outlook, Apple Mail and Yahoo do not clip this way (search snippet) — [Really Good Emails: email size and Gmail clipping](https://support.reallygoodemails.com/hc/en-us/articles/24963912931602-Email-Size-Gmail-Clipping)

### Inferences
- Two build paths for the branded sign-in email, in increasing effort: (a) point Supabase SMTP at Resend and paste rendered HTML into the Supabase dashboard template using `{{ .ConfirmationURL }}` and `{{ .Token }}` — quickest, but templates live outside the repo and are single-language; (b) enable the Send Email Hook pointing at a Next.js route handler that verifies the signature, renders a React Email component and sends through the existing Resend client — templates versioned in the repo, shared layout with onboarding emails, locale switching for Tamil/Hindi later. Path (b) fits the stated goal better. Failure mode to plan for: if the hook endpoint is down, no one can sign in, so it needs monitoring and a fast response.
- With path (b), build the link from `token_hash` to a Botly `/auth/confirm` page (which then calls verify) rather than the raw Supabase verify URL: this keeps the link on Botly's own domain and enables the interstitial-button defence against link scanners.
- For the lifecycle sequence, simplest is to keep it in code: a daily cron (or event handlers) that checks user state and sends React Email templates through Resend, since several of the key emails are event-driven anyway. Resend Automations/Broadcasts, Loops or Customer.io become worthwhile once a non-developer needs to edit copy and timing. I did not research Loops, Customer.io, MJML or Postmark pricing/features this session.
- Size is not a real risk for these emails: a React Email auth template is typically a few KB to low tens of KB, far under 102 KB; the risk only appears with Tailwind-heavy long marketing emails or base64-inlined images. Host images, never inline them.
- Testing ladder for a small team (from general knowledge, not sourced this session): React Email preview UI with its compatibility checker and dark-mode switcher → send real tests to Gmail (web + Android app), Outlook.com and Apple Mail/iPhone → check headers with "Show original" in Gmail for SPF/DKIM/DMARC pass → optionally a paid snapshot service (Litmus, Email on Acid) before a major redesign. Gmail on Android is the client that matters most for Indian small businesses (inference).
- Known quirks to design around (general knowledge, unverified here): classic Outlook for Windows uses Word's rendering engine (no border-radius/flex/background images without VML; React Email's Button component compensates with padding tricks); many clients block remote images by default, so the email must make sense with the logo missing; Gmail strips some CSS and web fonts.

### Gaps
- Did not research MJML, Postmark templates, Loops or Customer.io in this session; no comparative claims should be drawn from these notes.
- Did not verify current Resend pricing, free-tier limits, whether Broadcasts/Automations need a separate marketing plan (a search snippet mentions a "Resend Marketing Plan"), or INR pricing.
- Did not verify current Litmus / Email on Acid pricing or which free cross-client testing tools exist in 2026.
- Did not confirm whether the Supabase Send Email Hook is available on the free plan (the docs page read did not state plan limits) or the hook timeout value.
- Outlook, image-blocking and dark-mode quirks are from general knowledge, not sourced.

## 5. Brand elements needed before building

### Takeaway
Decide the sending subdomain(s), sender names, a monitored reply address, a hosted logo and one brand colour, and prepare a legal footer. If Botly is run by a company registered under the Companies Act 2013, its name, registered office address and CIN are required on business letters and official publications, which is widely applied to email footers.

### Cited Findings
- Companies Act 2013, section 12(3)(c): a company must have its name, registered office address and Corporate Identity Number, along with telephone number, fax number if any, e-mail and website addresses if any, printed on all business letters, billheads, letter papers, notices and other official publications (search snippet of legal explainers; the statute text itself was not opened) — [iPleaders: section 12 of the Companies Act 2013](https://blog.ipleaders.in/section-12-of-companies-act-2013/); [StudyCafe: Sec 12(3)(c)](https://studycafe.in/sec-123-c-of-companies-act-2013-2-75709.html)
- Penalty for default: Rs 1,000 per day of continuing non-compliance for the company and each officer in default, capped at Rs 1 lakh; the RoC has issued penalty orders for omitting CIN, address, email and phone on letterheads (search snippet) — [TaxGuru: MCA penalty for omitting details on letterhead](https://taxguru.in/company-law/mca-imposes-penalty-omitting-email-phone-company-letterhead.html); [StudyCafe: RoC penalty report](https://studycafe.in/roc-imposes-penalty-on-company-for-not-mentioning-cin-registered-address-email-id-and-contact-details-on-its-business-letters-409298.html)
- The sources found do not state explicitly that an email footer satisfies or is caught by section 12(3)(c); they speak of business letters and official publications (search snippet) — [iPleaders: section 12 of the Companies Act 2013](https://blog.ipleaders.in/section-12-of-companies-act-2013/)
- Use the application/company name as the From name; avoid no-reply; route replies to a monitored inbox — [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices)
- Send from a subdomain rather than the root domain — [Resend: subdomain or root domain](https://resend.com/docs/knowledge-base/is-it-better-to-send-emails-from-a-subdomain-or-the-root-domain)
- Keep one From address per message category — [Google email sender guidelines](https://support.google.com/a/answer/81126)

### Inferences
Pre-build checklist (my synthesis):
- Sending domain(s): verified in Resend with SPF, DKIM and a DMARC record (start at `p=none` with reporting, tighten later). One subdomain for transactional, one for lifecycle/marketing.
- Sender identities: e.g. "Botly" for auth and account mail; optionally a named person "from Botly" for onboarding nudges. Reply-To → a monitored support inbox (support@ or hello@). Decide whether WhatsApp support is offered and include the number, since Indian small-business owners commonly prefer it (inference, unsourced).
- Logo: PNG (not SVG — major clients do not render SVG reliably), exported at 2x for retina (e.g. 240x64 px displayed at 120x32), transparent background that works on both white and dark, hosted at a stable public HTTPS URL on Botly's own domain or CDN, with explicit width/height attributes and alt="Botly". (Sizes are a conventional suggestion, not sourced.)
- One primary brand colour for the button, with white text meeting contrast; neutral greys for body and footer. A second colour is unnecessary.
- Footer block: legal entity name; registered office address; CIN if a company (LLPs have an LLPIN — I did not verify the LLP Act's equivalent requirement; a sole proprietorship has neither but should still show a postal address and contact); support email; website; link to privacy policy and terms; on marketing-stream emails an unsubscribe link and a one-line "why you got this".
- Receipts/invoices: amounts in INR with the rupee symbol, GSTIN and invoice number if GST-registered. (GST invoice content rules were not researched this session.)
- Canonical URLs: login, dashboard, billing/upgrade, install guide, help — every email needs exactly one of them as its button target.
- Safest reading of section 12(3)(c): put the legal name, registered address and CIN in the footer of every email, since the cost is one grey line and the downside is a penalty. This is a cautious inference; confirm with the company's CA/CS.

### Gaps
- Botly's legal form (private limited, LLP, proprietorship) is unknown to me; the footer requirement differs.
- No authoritative ruling or MCA circular found confirming that section 12(3)(c) applies to automated transactional emails.
- Logo dimension and file-format guidance is from general practice, not sourced this session.
- BIMI (brand logo beside the sender in Gmail) was not researched; it generally needs enforced DMARC and a mark certificate and is likely out of scope for now.

## 6. Common mistakes small teams make with onboarding email

### Takeaway
The recurring errors are leaving auth mail on the provider default, mixing marketing into transactional streams, sending calendar-based emails that ignore what the user has already done, and under-investing in the plain basics (plain-text part, monitored reply address, precise expiry).

### Cited Findings
- One-size-fits-all welcome emails that present many features instead of one direction — [Sequenzy: SaaS onboarding emails playbook](https://www.sequenzy.com/blog/saas-onboarding-emails-playbook)
- Ignoring activation state: sending setup prompts to users who are already active — [Sequenzy: SaaS onboarding emails playbook](https://www.sequenzy.com/blog/saas-onboarding-emails-playbook)
- Feature-focused rather than outcome-focused copy — [Sequenzy: SaaS onboarding emails playbook](https://www.sequenzy.com/blog/saas-onboarding-emails-playbook)
- Lifecycle emails that contradict earlier transactional confirmations — [Sequenzy: SaaS onboarding emails playbook](https://www.sequenzy.com/blog/saas-onboarding-emails-playbook)
- Measuring opens rather than the behaviour after the click — [Sequenzy: SaaS onboarding emails playbook](https://www.sequenzy.com/blog/saas-onboarding-emails-playbook)
- Mixing transactional and broadcast mail on one stream (search snippet) — [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices)
- Using noreply@, which signals you do not want to hear from customers and forfeits reply engagement — [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices)
- Unverified domain, missing plain-text version, generic sender, and no unsubscribe link on marketing mail are Resend's listed common causes of spam placement (search snippet) — [Resend: explore sending features](https://resend.com/docs/explore-sending-features)
- Leaving click tracking on for auth links so the tracker rewrites them; and one-time links being consumed by mail-security prefetch — [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- Vague or relative expiry wording — [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices)
- Only one trial-ending email at the last moment, compressing the decision window (search snippet) — [Bento: trial expiration email best practices](https://bentonow.com/posts/trial-expiration-email-best-practices)
- Continuing the trial sequence after the user has already upgraded (search snippet) — [Salesmate: 14 days SaaS trial workflow](https://support.salesmate.io/hc/en-us/articles/42342694768537-14-Days-Saas-Trial)
- Sending from the root domain so a reputation problem on any mail type damages everything (search snippet) — [Resend: subdomain or root domain](https://resend.com/docs/knowledge-base/is-it-better-to-send-emails-from-a-subdomain-or-the-root-domain)

### Inferences
- Botly-specific risks: (1) the sign-in email is the first brand impression and today is the Supabase default — fix this before any nurture email; (2) trial emails that count only days and ignore the 50-reply cap will misinform busy sites; (3) "your assistant is ready" must fire from the real build-complete event, or it will contradict what the dashboard shows; (4) if the import/build runs in the background after the tab is closed (recent commits suggest it does), the "ready" email is the only way the user learns it finished and deserves the most design care after the sign-in email; (5) over-designing — the examples found favour near-plain emails, so a logo, one button and good copy is the professional look, not a heavy template.
- Not double-sending: if both Supabase's built-in templates and custom Resend sends exist for the same event during migration, users get two emails. Enabling the Send Email Hook switches off Supabase's own sending, which avoids this for auth mail.
- Rate limits and resend UX: a "didn't get it? resend" control with a cooldown, and copy telling users to check spam/Promotions, reduces support load (general practice, unsourced).

### Gaps
- No quantitative evidence found for the relative cost of each mistake.
- Most "mistakes" lists found are vendor blog opinion; the Postmark, Resend, Supabase and Google items are the authoritative ones.

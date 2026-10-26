# Domain, DNS, sender identity, mailbox and deliverability for Botly (checked 7 Oct 2026)

Conventions used below: `example.com` stands for the domain Botly will buy. "Fetched" means the page was opened in this session; "search snippet" means the figure came from a search result summary of a third-party page and was not confirmed on the vendor's own page. Nothing in DNS, accounts or code was changed.

## 1. Resend: `onboarding@resend.dev` limits, domain verification, regions, plans

### Takeaway
`onboarding@resend.dev` only delivers to the Resend account owner's own email address, so it cannot be used for real customers; a verified domain is mandatory. Verification needs three DNS records (MX + SPF TXT on a `send` subdomain, DKIM TXT at `resend._domainkey`), usually completes in minutes but can take up to 72 hours, and the free plan (3,000/month, 100/day, 3 domains) is enough to start.

### Cited Findings
- Sending from `onboarding@resend.dev` to anyone other than the account's own email returns HTTP 403 with "You can only send testing emails to your own email address"; a verified domain is needed to send to other recipients (search snippet of third-party guides, not Resend's own page) — [Apidog guide](https://apidog.com/blog/resend-api-key/); [Achromatic docs](https://www.achromatic.dev/docs/starter-kits/pro-nextjs-prisma/email/configuration)
- Resend's test recipients for simulating events are `delivered@resend.dev`, `bounced@resend.dev`, `complained@resend.dev`, `suppressed@resend.dev`; most support `+label` — [Resend KB: test addresses](https://www.resend.com/docs/knowledge-base/what-email-addresses-to-use-for-testing)
- "You must add and verify at least one domain to send emails with Resend." After verification you can send from any address at that domain without further setup — [Resend: Domains introduction](https://resend.com/docs/dashboard/domains/introduction)
- Exact records Resend asks for (shown for the us-east-1 region in the Cloudflare guide; the DKIM value is unique per domain and copied from the dashboard) — [Resend: Cloudflare guide](https://resend.com/docs/dashboard/domains/cloudflare):

  | Type | Name | Value | Priority | Note |
  |---|---|---|---|---|
  | MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | 10 | bounce/complaint return path |
  | TXT | `send` | `v=spf1 include:amazonses.com ~all` | - | SPF for the return-path host |
  | TXT | `resend._domainkey` | `p=<long key from dashboard>` | - | DKIM; on Cloudflare must be "DNS only" |
  | MX (optional, inbound only) | `inbound` | `inbound-smtp.us-east-1.amazonaws.com` | 10 | only if using Resend inbound |

- "It may take up to 72 hours to complete the verification process (often much faster)." — [Resend: Cloudflare guide](https://resend.com/docs/dashboard/domains/cloudflare)
- Regions: North Virginia `us-east-1`, Ireland `eu-west-1`, Sao Paulo `sa-east-1`, Tokyo `ap-northeast-1`. Region controls where mail is routed and sent from, not where account data is stored (US). To change region you delete the domain, re-add it with the new region and update DNS — [Resend: Regions](https://resend.com/docs/dashboard/domains/regions)
- Other per-domain options: open/click tracking, enforced TLS, custom Return-Path subdomain, region; DMARC and BIMI can be added after verification — [Resend: Domains introduction](https://resend.com/docs/dashboard/domains/introduction)
- Pricing (USD, fetched 7 Oct 2026) — [Resend pricing](https://resend.com/pricing):

  | Plan | Price | Emails/month | Daily limit | Domains | Overage |
  |---|---|---|---|---|---|
  | Free | $0 | 3,000 | 100/day | 3 | none |
  | Pro | $20/mo | 50,000 | none | 10 | $0.90 per 1,000 |
  | Pro (higher tier) | $35/mo | 100,000 | none | 10 | $0.90 per 1,000 |
  | Scale | $90 to $1,150/mo | 100K to 2.5M | none | 1,000 | $0.90 down to $0.46 per 1,000 |
  | Enterprise | custom | custom | custom | by contract | custom |

  Data retention is 30 days on Free, Pro and Scale.
- Supabase Auth can send through Resend via SMTP: host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key; sender email and name are required fields — [Resend: Send with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)
- Supabase's built-in SMTP sends only to pre-authorised addresses (project team members) and is limited to 2 messages per hour; after enabling custom SMTP a starting limit of 30 messages per hour applies and can be raised on the Rate Limits page — [Supabase: Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

### Inferences
- With one verified domain, both paths (app via Resend API, sign-in mail via Supabase Auth through Resend SMTP) send from Botly's own address. Both draw on the same Resend quota: on Free that is 100 emails/day total, including sign-in emails, so a burst of sign-ups plus lead notifications can exhaust it. Pro at $20/month removes the daily cap.
- For Indian recipients Tokyo (`ap-northeast-1`) is the geographically nearest of the four regions. The MX host name contains the region, so if Tokyo is chosen the `send` MX value will differ from the us-east-1 example above; copy the exact values the Resend dashboard shows rather than this table.
- If the domain added to Resend is a subdomain (for example `mail.example.com`), the record names become `send.mail`, `resend._domainkey.mail` in the `example.com` zone.
- Supabase's 30/hour default after switching to custom SMTP is a likely first production failure for sign-in emails; raise it when the SMTP switch is made.

### Gaps
- Resend's own page stating the `resend.dev` restriction was not located; the wording comes from third-party guides quoting the API error.
- Whether Resend's Free plan restricts region choice or the Tokyo MX/SPF values was not confirmed on a fetched page.
- The fetched pricing summary showed a $35 Pro tier at 100,000 emails next to a $90 Scale tier that also starts at 100K; this overlap was not resolved and should be re-read on the pricing page before budgeting.

## 2. Root domain vs subdomain strategy

### Takeaway
Send product mail from a subdomain, and keep marketing on a different subdomain if it is ever added; mailboxes for humans live on the root. For a small product one transactional subdomain is enough to start.

### Cited Findings
- Resend recommends subdomains such as `updates.example.com` "to isolate your sending reputation and to clearly communicate your intent to your recipients", and notes subdomains allow different tracking settings — [Resend: Domains introduction](https://resend.com/docs/dashboard/domains/introduction)
- Supabase recommends separate sending domains per purpose, for example `auth.example.com` for authentication and `marketing.example.com` for marketing, and separate SMTP services, so that a reputation problem in one does not affect the other — [Supabase: Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- Yahoo: "Don't send bulk/marketing email from the same IPs you use to send user mail, transactional mail, alerts, etc." — [Yahoo Sender Hub best practices](https://senders.yahooinc.com/best-practices/)
- Gmail counts all subdomains toward the primary domain's bulk-sender volume (for example `promotions.solarmora.com` counts toward `solarmora.com`) — [Google: Email sender guidelines FAQ](https://support.google.com/a/answer/14229414?hl=en)

### Inferences
- Isolation is partial: mailbox providers track reputation per sending (sub)domain and DKIM domain, but Gmail's volume classification rolls up to the registered domain, so a subdomain protects against spill-over from a bad stream rather than creating a fully separate identity.
- Practical layout for Botly: root `example.com` for the website and human mailboxes (Google Workspace or Zoho); `mail.example.com` (or `notify.`) verified in Resend for all product mail including Supabase sign-in mail; add `news.example.com` only when newsletters or promotions begin. Splitting auth mail onto its own `auth.` subdomain is Supabase's advice but is optional at Botly's volume, and each extra subdomain uses one of the 3 free Resend domains.
- From-addresses then look like `hello@mail.example.com`. If the owner wants the bare `hello@example.com` as the visible From, the root domain itself must be verified in Resend; this is simpler to read but ties product-mail reputation to the mailbox domain. A middle path is From `Botly <hello@mail.example.com>` with Reply-To `hello@example.com`.

### Gaps
- No primary source quantifies how strongly Gmail separates subdomain reputation from root-domain reputation.

## 3. SPF, DKIM, DMARC: records, alignment, rollout, mistakes

### Takeaway
Resend supplies SPF and DKIM; the owner must add DMARC. Start at `p=none` with a reporting address, read reports, then move to `quarantine` and `reject`. Keep exactly one SPF record per host name.

### Cited Findings
- Resend's example DMARC records: `v=DMARC1; p=none; rua=mailto:dmarcreports@example.com;`, then `p=quarantine`, then `p=reject`. Rollout: start at none while monitoring, move to quarantine after confirming legitimate mail passes, then reject — [Resend: DMARC](https://resend.com/docs/dashboard/domains/dmarc)
- DMARC passes when either SPF or DKIM passes; it fails only when both fail — [Resend: DMARC](https://resend.com/docs/dashboard/domains/dmarc)
- Tools Resend names for monitoring: Google Postmaster Tools, DMARC monitoring services, and Resend's own DMARC analyzer — [Resend: DMARC](https://resend.com/docs/dashboard/domains/dmarc)
- Gmail's alignment rule: "For direct email, the domain in the sender's From: header must be aligned with either the SPF domain or the DKIM domain" — [Google: Email sender guidelines](https://support.google.com/a/answer/81126?hl=en)
- Yahoo's rule for bulk senders: "Publish a valid DMARC policy with at least p=none - DMARC must pass" and From-domain aligned with SPF or DKIM domain — [Yahoo Sender Hub best practices](https://senders.yahooinc.com/best-practices/)
- Standards (not re-fetched this session; cited as the defining documents): SPF evaluation is limited to 10 DNS-querying mechanisms and multiple SPF records on one name produce a permanent error — [RFC 7208](https://www.rfc-editor.org/rfc/rfc7208); DKIM — [RFC 6376](https://www.rfc-editor.org/rfc/rfc6376); DMARC — [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489)

### Inferences
- Concrete record set for `example.com` with Resend on the `mail` subdomain and a mailbox provider on the root:

  ```
  ; DMARC for the whole organisational domain (covers subdomains unless sp= says otherwise)
  _dmarc.example.com.            TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.com; fo=1"

  ; Resend (names relative to example.com; values from the Resend dashboard)
  send.mail.example.com.         MX   10 feedback-smtp.<region>.amazonses.com.
  send.mail.example.com.         TXT  "v=spf1 include:amazonses.com ~all"
  resend._domainkey.mail.example.com. TXT "p=<key>"

  ; Mailbox provider on the root (one SPF record only)
  example.com.                   TXT  "v=spf1 include:<mailbox provider> ~all"
  ```
- Alignment in this layout: the visible From is `@mail.example.com`; DKIM signs with `d=mail.example.com` (exact match) and the return path is `send.mail.example.com` (same organisational domain, passes under DMARC's default relaxed alignment). Both mechanisms align, so DMARC passes on either.
- Rollout timing that fits a low-volume sender: `p=none` for 2 to 4 weeks, check that every legitimate source (Resend, the mailbox provider, anything else) shows as passing, then `p=quarantine`, then `p=reject` after another 2 to 4 weeks. Resend's page says only "a few days" in monitoring; the longer window is a conservative choice because low volume produces few reports.
- Common mistakes: two `v=spf1` TXT records on the same name (merge into one with several `include:`); more than 10 lookups from stacking includes; putting Resend's `include:amazonses.com` on the root when Resend only needs it on `send.`; Cloudflare proxy (orange cloud) left on for mail-related records; moving to `p=reject` before the mailbox provider's DKIM is switched on; the `rua` mailbox not existing.
- `rua` reports are XML and arrive daily per receiver; point them at a dedicated `dmarc@` address or a report service rather than a personal inbox.

### Gaps
- No free DMARC report tool's current free-tier limits were confirmed on an official page this session. Resend's DMARC analyzer is named in Resend's docs; Cloudflare DMARC Management, Postmark's DMARC digests and dmarcian are commonly used options whose present terms need checking.
- RFC text was cited from the standards themselves without re-fetching.

## 4. Gmail, Yahoo, Microsoft sender rules; one-click unsubscribe; complaint thresholds

### Takeaway
At Botly's volume only the "all senders" rules strictly apply (SPF or DKIM, TLS, valid PTR, spam rate under 0.3%), but meeting the bulk rules from day one (SPF and DKIM and DMARC, aligned) costs nothing with Resend and is what keeps Gmail inbox placement. One-click unsubscribe is required only for marketing or subscribed mail, not for sign-in, receipts or account notices.

### Cited Findings
- Gmail, all senders (enforced since 1 Feb 2024): SPF or DKIM; valid forward and reverse DNS; TLS; spam rate below 0.3%; RFC 5322 format; no impersonating Gmail From headers — [Google: Email sender guidelines](https://support.google.com/a/answer/81126?hl=en)
- Gmail, bulk senders (about 5,000+ messages/day to personal Gmail accounts): SPF and DKIM both, DMARC (policy may be `none`), From aligned with SPF or DKIM domain, and "Marketing messages and subscribed messages must support one-click unsubscribe" with a visible unsubscribe link — [Google: Email sender guidelines](https://support.google.com/a/answer/81126?hl=en)
- Bulk sender = "close to 5,000 messages or more to personal Gmail accounts within a 24-hour period"; subdomains count toward the primary domain; bulk status "doesn't have an expiration date" — [Google: sender guidelines FAQ](https://support.google.com/a/answer/14229414?hl=en)
- Spam rate: keep below 0.1% and avoid ever reaching 0.3% or higher; impact is graduated — [Google: sender guidelines FAQ](https://support.google.com/a/answer/14229414?hl=en)
- One-click unsubscribe applies only to marketing and promotional messages; password resets, reservation confirmations and form submissions are given as transactional examples that are exempt — [Google: sender guidelines FAQ](https://support.google.com/a/answer/14229414?hl=en)
- Since November 2025 Gmail is "ramping up its enforcement on non-compliant traffic", including temporary and permanent rejections — [Google: sender guidelines FAQ](https://support.google.com/a/answer/14229414?hl=en)
- Yahoo, all senders: SPF or DKIM at minimum, spam rate below 0.3%, valid forward/reverse DNS, RFC 5321/5322. Bulk senders: SPF and DKIM, DMARC at least `p=none` and passing, alignment, a functioning List-Unsubscribe header supporting one-click for marketing and subscribed messages ("The Post (RFC 8058) method is highly recommended"), and "Honor unsubscribes within 2 days" — [Yahoo Sender Hub best practices](https://senders.yahooinc.com/best-practices/)
- Microsoft (Outlook.com, Hotmail.com, Live.com): from 5 May 2025, domains sending over 5,000 emails/day must pass SPF and DKIM and publish DMARC at `p=none` or stricter aligned with SPF or DKIM; non-compliant mail goes to Junk first and is later rejected, with error `550 5.7.515` (secondary sources; Microsoft's own post could not be read) — [Proofpoint](https://www.proofpoint.com/us/blog/email-and-cloud-threats/microsoft-new-email-authentication-requirements); [PowerDMARC](https://powerdmarc.com/dmarc-outlook-email-authentication/); Microsoft's announcement: [Tech Community](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730)
- One-click unsubscribe mechanism is defined in [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058) (not re-fetched this session).

### Inferences
- Botly's mail types map as: sign-in/magic link, password reset, onboarding steps tied to an account action, lead notifications the customer configured, billing and trial-status notices = transactional, no one-click unsubscribe required. Trial emails that promote upgrading, tips series, newsletters and re-engagement mail are marketing in Gmail's sense and need `List-Unsubscribe` plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click` and a visible link once the bulk threshold applies; adding them now is cheap insurance, since recipients mark unwanted mail as spam when they cannot unsubscribe.
- A 0.1% complaint ceiling is brutal at low volume: at 300 Gmail-bound emails a day one complaint is 0.33%. Lead-notification emails with a per-customer on/off preference are the stream most likely to draw complaints.
- Resend already satisfies TLS and PTR (it sends via Amazon SES infrastructure, as the `amazonses.com` records show), so the owner's work is DNS plus content and list practice.

### Gaps
- Microsoft's primary announcement page returned only its title; details rest on secondary reports.
- No 2026-specific change to Gmail or Yahoo rules beyond the November 2025 enforcement ramp was found; absence of a finding is not proof none exists.

## 5. New-domain reputation, warm-up, monitoring

### Takeaway
A brand-new domain has no reputation, but at tens to low hundreds of transactional emails a day no formal warm-up schedule is needed; just avoid a sudden blast. Watch bounce rate (under 4%) and spam rate (under 0.08%) in Resend, and register the domain in Google Postmaster Tools.

### Cited Findings
- Resend says a new domain should have a warm-up plan and gives a schedule for new domains: days 1 to 3, 150 to 400 emails/day; days 4 to 7, 700 to 2,000/day — [Resend KB: warming up](https://resend.com/docs/knowledge-base/warming-up)
- Resend's thresholds: "keep your bounce rate below 4% and your spam rate below 0.08%"; if either rises, slow down and investigate — [Resend KB: warming up](https://resend.com/docs/knowledge-base/warming-up)
- Google Postmaster Tools v2 replaced the old Domain/IP Reputation charts with a Compliance Status dashboard covering authentication, alignment, unsubscribe and spam rate; Google does not publish a minimum volume, and third-party guides estimate roughly 200+ Gmail-bound emails/day before data appears consistently (secondary sources) — [Blueshift](https://blueshift.com/blog/google-postmaster-tools-v2/); [Suped](https://www.suped.com/learn/email-deliverability/how-does-google-postmaster-compliance-work-and-what-are-the-volume-thresholds-for-bulk-senders)

### Inferences
- Resend's day-1 figure (150 to 400) is already above Botly's likely daily volume and above the Free plan's 100/day cap, so ordinary organic sending is itself a compliant warm-up. The real risk is a one-off import: emailing every existing user or a purchased lead list on day one.
- Postmaster Tools will probably show little or no data at Botly's volume; set it up anyway (one TXT record) so history exists when volume grows.
- Wire Resend webhooks for `email.bounced` and `email.complained` and stop sending to those addresses; a signup form that accepts mistyped addresses is the usual source of bounces above 4%. Use `bounced@resend.dev` and `complained@resend.dev` to test the handlers.
- Wait a day or two after registering the domain before first sends, and have the website live on it, since some filters distrust domains registered within the last few days.

### Gaps
- No primary Google statement on the minimum volume for Postmaster Tools data.
- Resend's exact webhook event names were not re-confirmed on a fetched page.

## 6. Sender address choices

### Takeaway
Use a recognisable, monitored identity with a display name ("Botly" or "Priya from Botly") and a Reply-To that reaches a human; reserve `no-reply@` for sign-in codes if used at all, and do not send from `admin@`.

### Cited Findings
- Supabase's docs suggest a default From such as `no-reply@example.com` for auth mail — [Supabase: Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- Resend's Supabase guide uses `support@example.com` as the example sender and requires both sender email and name — [Resend: Send with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)
- Microsoft's high-volume guidance is reported to recommend valid, reply-capable From/Reply-To addresses and functional unsubscribe links (secondary source) — [Proofpoint](https://www.proofpoint.com/us/blog/email-and-cloud-threats/microsoft-new-email-authentication-requirements)

### Inferences
- `admin@` reads like a system or phishing sender ("admin" is a staple of credential-phishing mail), is a common spam-trap and role-account target, and gives the recipient no clue who is writing. Keep `admin@` as an internal alias for registrar, DNS and vendor accounts only.
- Suggested mapping: sign-in/magic link from `Botly <login@mail.example.com>` or `no-reply@`, Reply-To `support@example.com`; onboarding and trial mail from `Botly <hello@mail.example.com>`, Reply-To `hello@example.com`; lead notifications from `Botly Leads <leads@mail.example.com>` with Reply-To set to the lead's own email so the business owner can reply straight to the lead; billing from `billing@`.
- Keep display names stable; Gmail users search and filter by them, and changing them resets recognition.
- Role addresses to create on the root (as aliases or a group on one paid mailbox, not separate paid users): `hello@`, `support@`, `billing@`, `security@`, `dmarc@`, `admin@`, plus `postmaster@` and `abuse@`, which mail standards and blocklist operators expect to exist.
- Replies to an address on `mail.example.com` will not arrive unless that subdomain has MX records; a Reply-To on the root avoids needing inbound mail on the sending subdomain.

### Gaps
- No primary source was fetched that states `admin@` harms deliverability; this is practitioner judgement, not a documented rule.

## 7. Professional mailboxes: Google Workspace, Zoho, Microsoft 365, registrar mail

### Takeaway
For a one-to-three-person Indian team, Zoho Mail is the cheapest (free for up to 5 users with web-only access, or about Rs 59 per user/month for Mail Lite) and Google Workspace is the most familiar; either coexists with Resend without SPF conflict because Resend's SPF lives on the `send` subdomain.

### Cited Findings
- Google Workspace India list prices (fetched 7 Oct 2026, per user per month): Starter Rs 270 on monthly billing, with "save 16%" on a one-year commitment, 30 GB pooled storage; Standard Rs 1,080 (introductory Rs 864 for the first 20 users), 2 TB; Enterprise by quote. The fetched page summary also showed a "Base" plan at Rs 99 per user/month (Rs 49.50 for the first 3 months for new customers), 20 GB, maximum 20 users — [Google Workspace India pricing](https://workspace.google.com/intl/en_in/pricing)
- Google Workspace MX: a single record, value `smtp.google.com`, priority 1; older accounts may have `aspmx...` values that still work; up to 72 hours to take effect — [Google Workspace: set up MX records](https://knowledge.workspace.google.com/admin/domains/set-up-mx-records-for-google-workspace?hl=en)
- Zoho Mail Forever Free: one domain, up to 5 users, 5 GB per user, "IMAP/ POP/ Active Sync not included", "Available only in select data centers". Paid plans: Mail Lite (5 GB or 10 GB), Mail Premium (50 GB), Workplace Standard, Workplace Professional; Mail Lite and Mail Premium are annual-billing only — [Zoho Mail pricing](https://www.zoho.com/mail/zohomail-pricing.html)
- Zoho India prices (reseller pages, search snippet, not confirmed on Zoho's page): Mail Lite Rs 59 per user/month (5 GB) or Rs 75 (10 GB), Workplace Standard Rs 99 per user/month, all billed annually, plus 18% GST — [Cloudfy Systems](https://cloudfysystems.com/blog/zoho-mail-pricing-plans-india-2025); [Precision Tech](https://precisiontech.in/domain-hosting-email/email-solutions/zoho-mail/)
- Zoho generic MX: `mx.zoho.com` (10), `mx2.zoho.com` (20), `mx3.zoho.com` (50); "The TLD for the MX record will vary based on the DC in which your data is hosted", and the exact values are shown in the Admin Console — [Zoho Mail: configure email delivery](https://www.zoho.com/mail/help/adminconsole/configure-email-delivery.html)
- Microsoft 365 Business Basic in India: about Rs 123 to Rs 145 per user/month on annual commitment depending on reseller (search snippets; reseller figures disagree and Microsoft's own page was not fetched); includes a 50 GB Exchange mailbox, Teams, 1 TB OneDrive — [IT for SME](https://itforsme.in/pricing/microsoft-365-india); [Cloudfy Systems](https://cloudfysystems.com/blog/microsoft-365-pricing-plans-india)
- Resend's SPF TXT is placed on the `send` name, not on the root — [Resend: Cloudflare guide](https://resend.com/docs/dashboard/domains/cloudflare)

### Inferences
- Coexistence: the root's MX and its single SPF record belong to the mailbox provider; Resend's MX and SPF sit on `send.` (or `send.mail.`), and DKIM selectors differ (`resend._domainkey` vs the provider's selector, e.g. `google._domainkey` or `zmail._domainkey`). Nothing overlaps. Do not add `include:amazonses.com` to the root SPF.
- Standard SPF values to expect (not re-verified on vendor pages this session; use the value each admin console displays): Google Workspace `v=spf1 include:_spf.google.com ~all`; Zoho on the India data centre `v=spf1 include:zoho.in ~all` with MX `mx.zoho.in`, `mx2.zoho.in`, `mx3.zoho.in`; Microsoft 365 `v=spf1 include:spf.protection.outlook.com -all` with MX `<domain-with-dashes>.mail.protection.outlook.com`.
- Turn on the mailbox provider's own DKIM signing before DMARC moves past `p=none`, otherwise replies sent by humans from Gmail/Zoho can fail DMARC when forwarded.
- Cost for one mailbox with aliases for a year: Zoho Free Rs 0 (webmail and Zoho apps only); Zoho Mail Lite about Rs 708 plus GST; Google Workspace Starter about Rs 2,720 on annual commitment (Rs 270 less 16%, times 12; computed, plus GST) or Rs 3,240 monthly.
- Registrar-bundled mail (Hostinger, GoDaddy, Namecheap Private Email) is usually cheap in year one and weaker on spam filtering and admin controls; email forwarding offered by Cloudflare Email Routing or Porkbun can receive mail at role addresses for free but cannot properly send replies from them.

### Gaps
- The Rs 99 Google Workspace "Base" plan appeared in the fetched page summary but is unfamiliar; confirm on the live pricing page that it exists, includes custom-domain Gmail, and is purchasable for a new Indian account before relying on it.
- Zoho's INR prices were not visible on the official page fetched (prices render dynamically; the `/in/` URL returned 404). Whether the Forever Free plan is offered on the India data centre today is unconfirmed.
- Microsoft's official India price was not fetched; reseller figures conflict (Rs 123, Rs 125, Rs 145).
- Registrar-bundled mailbox prices for India were not researched.

## 8. Buying the domain and hosting DNS

### Takeaway
Buy `.com` if available (about $10 to $11 a year at cost); `.in` is cheaper and fine for an India-only audience but Cloudflare Registrar does not sell it. Host DNS at Cloudflare (free) regardless of registrar, and point the app to Vercel with an A record and a CNAME.

### Cited Findings
- Cloudflare Registrar supports `.com`, `.ai`, `.app`, `.io`; `.in` and `.co.in` are not on its supported list — [Cloudflare TLD policies](https://www.cloudflare.com/tld-policies/)
- Cloudflare sells at registry cost with no markup: `.com` about $10.44 to $10.46 per year for registration and renewal; `.ai` about $80 per year (aggregator figures, search snippet) — [StartupOwl review](https://startupowl.com/reviews/cloudflare-registrar); [DomainOffer](https://domainoffer.net/tld/io/cloudflare)
- Porkbun (aggregator, dated May to July 2026): `.com` $10.08 first year, $11.08 renewal; `.app` $7.75 first year, $14.93 renewal; `.ai` $81.70 registration, $82.70 renewal; `.in` $6.83 registration, about $7.83 renewal — [DomainOffer: Porkbun .com](https://domainoffer.net/tld/com/porkbun); [Porkbun .app](https://domainoffer.net/tld/app/porkbun); [Porkbun .ai](https://domainoffer.net/tld/ai/porkbun); [Porkbun .in](https://domainoffer.net/tld/in/porkbun)
- `.in` elsewhere (aggregator, USD): GoDaddy $12.99 regular registration and renewal with a first-year promo near $1; Hostinger $2.99 to $6.99 first year, $9.99 renewal; Namecheap $9.98 registration, $11.98 renewal — [DomainOffer: GoDaddy .in](https://domainoffer.net/tld/in/godaddy); [Hostinger .in](https://domainoffer.net/tld/in/hostinger); [Namecheap .in](https://domainoffer.net/tld/in/namecheap)
- Vercel: an apex domain is configured with an A record and a subdomain with a CNAME; each project gets its own CNAME target shown in the dashboard; alternatively switch nameservers to Vercel. Vercel warns to copy existing DNS records, "including MX records for email and any verification TXT records", before changing nameservers. Hobby teams can attach up to 50 custom domains per project — [Vercel: add a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- Vercel's knowledge base lists the apex A record as `76.76.21.21` "or your domain card's value" paired with a `www` CNAME — [Vercel KB: A records](https://vercel.com/kb/guide/a-record-and-caa-with-vercel)
- Adding an apex prompts adding `www` too, with a redirect between them — [Vercel: add a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)

### Inferences
- Recommendation: check `.com` first; if taken, `.in` suits Indian small-business customers and is the cheapest to renew. `.ai` costs roughly eight times as much and is typically sold in two-year minimum terms; `.app` is fine technically (HTTPS-only by registry policy) but less familiar to Indian SMB owners. Compare renewal price, not first-year promo; GoDaddy and Hostinger discount year one heavily.
- Registrar choice: Cloudflare Registrar for `.com` (at cost, but the domain must use Cloudflare nameservers); Porkbun or Namecheap for `.in`; GoDaddy India or Hostinger if paying in INR by UPI matters more than renewal price. In all cases set the nameservers to Cloudflare's free DNS.
- Cloudflare DNS vs Vercel DNS: both work. Cloudflare keeps mail records independent of the hosting platform and has DMARC tooling; if used, set the Vercel A/CNAME records and all mail records to "DNS only" (grey cloud). Vercel DNS is simpler if everything stays on Vercel. Either way all Resend, mailbox and DMARC records must be recreated at whichever provider is authoritative.
- Turn on registrar lock, auto-renew and two-factor authentication; register for 2+ years since losing the domain breaks sign-in mail, the widget and customer embeds at once.

### Gaps
- No official INR price was confirmed for any registrar; all figures are USD from an aggregator or review site, dated May to October 2026, excluding 18% GST and currency conversion.
- Whether Namecheap and Porkbun accept Indian cards/UPI smoothly was not checked.
- `.in` registration may require Indian registrant contact details or e-KYC under NIXI policy; this was not verified.

## 9. Moving the app off `*.vercel.app`

### Takeaway
The domain switch touches at least seven places besides DNS; the old `vercel.app` host must keep serving the widget script because customers have it embedded.

### Cited Findings
- Vercel gives every deployment a `vercel.app` URL and custom domains are added on top under Settings then Domains — [Vercel: add a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- Supabase Site URL "defines the default redirect URL when no `redirectTo` is specified in the code"; redirect URLs passed in code must match an allow-list entry; wildcards `*`, `**`, `?` are supported with `.` and `/` as separators; examples given are `http://localhost:3000/**` and `https://*-<team-or-account-slug>.vercel.app/**`; email templates should use `{{ .RedirectTo }}` instead of `{{ .SiteURL }}` when `redirectTo` is used — [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- Supabase Auth sender address and SMTP are set under Authentication, Email, SMTP Settings — [Resend: Send with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)

### Inferences
Checklist of changes (items 4 to 7 are standard practice and were not verified against vendor docs this session; confirm names of settings in each console and in Botly's codebase):
1. Vercel: add `example.com` and `www.example.com` to the project, choose the primary, redirect the other. Leave the `*.vercel.app` production domain attached; do not redirect it wholesale.
2. App env vars on Vercel (whatever Botly uses for its base URL, e.g. `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL`): set to `https://example.com` and redeploy, since `NEXT_PUBLIC_*` values are baked in at build time. Also the Resend `from` address env var, and any absolute links inside email templates.
3. Supabase: Site URL to `https://example.com`; add `https://example.com/**` (and `www`) to the redirect allow-list while keeping the old `vercel.app` and localhost entries; update email templates; switch SMTP to Resend and set sender name/address; raise the auth email rate limit.
4. Google OAuth (Google Cloud console): add the new origin to Authorised JavaScript origins. If sign-in goes through Supabase, the authorised redirect URI is the Supabase project callback (`https://<project-ref>.supabase.co/auth/v1/callback`) and does not change; update the consent screen's home page, privacy policy and authorised domains, which may trigger brand re-verification.
5. Razorpay: update the webhook URL to the new host (keep the same secret, or rotate deliberately), and update the registered business website; Razorpay reviews the website (policies, contact, pricing pages) and a changed URL may need re-verification before live payments on the new domain.
6. Widget script: customer sites embed `https://<old>.vercel.app/...`. Keep that host serving the script and its API indefinitely, issue new embed snippets from the new domain, and check CORS allow-lists and any hard-coded API base URL inside the widget so both hosts work during migration. A redirect on a `<script src>` generally works for GET but breaks POSTs and CORS preflights from the widget to the old API host.
7. Everything else that stores a URL: sitemap, canonical tags and Open Graph URLs, Search Console property, analytics, cookie domain, CSP headers, links in already-sent emails (old links must still resolve), and third-party webhooks (Resend webhooks pointed at the app).

### Gaps
- Razorpay's and Google's current documentation for these steps was not fetched.
- Botly's actual env var names and widget loading mechanism were not inspected (research-only task); the report writer should check the codebase notes from other researchers.

## 10. BIMI and the inbox logo

### Takeaway
Not worth it yet: BIMI needs DMARC at enforcement plus a paid certificate costing roughly USD 650 to 1,700 a year, and the cheaper certificate type needs 12 months of prior logo use.

### Cited Findings
- VMC costs about USD 749 to 1,688 per year and needs a registered trademark; it enables Gmail's blue verified checkmark. CMC costs about USD 650 to 1,100 per year, needs no trademark but requires proof the logo has been in public use for 12+ months, and shows the logo in Gmail without the checkmark. Both need DMARC at enforcement with SPF and DKIM; Apple Mail does not accept CMCs as of 2026; VMC issuance takes about two to four weeks (secondary sources, search snippet) — [CaptainDNS guide](https://www.captaindns.com/en/blog/bimi-vmc-cmc-certificate-guide); [Prospeo](https://prospeo.io/s/bimi-dns-record)
- Resend supports implementing BIMI on a verified domain — [Resend: Domains introduction](https://resend.com/docs/dashboard/domains/introduction)

### Inferences
- For a pre-revenue product the certificate would cost far more than the domain, mailbox and email service combined. The free substitute is a consistent display name; a Google account avatar only shows for mail sent from a Google mailbox, not for Resend mail.
- Revisit after DMARC has been at `p=quarantine`/`reject` for some months and the logo has 12 months of public use (start the clock now by publishing the logo on the new domain).

### Gaps
- Certificate prices were not confirmed on DigiCert, Entrust or GlobalSign pages. The exact DMARC policy BIMI requires (`quarantine` at `pct=100` or `reject`) was not confirmed against the BIMI Group's specification this session.

## 11. Indian legal and compliance points

### Takeaway
The DPDP Act's consent and notice duties become enforceable on 13 May 2027; until then there is no email-specific Indian statute comparable to CAN-SPAM that was found, but Botly should build consent capture and easy withdrawal now.

### Cited Findings
- MeitY notified the Digital Personal Data Protection Rules, 2025 on 13 November 2025. Rules 1, 2 and 17 to 21 took effect immediately; Rule 4 (Consent Manager registration) after one year; Rules 3, 5 to 16, 22 and 23 take effect 18 months after notification, i.e. 13 May 2027 (law-firm and advisory summaries, search snippet) — [Mondaq](https://www.mondaq.com/india/data-protection/1708164/digital-personal-data-protection-rules-2025-notified); [KPMG](https://assets.kpmg.com/content/dam/kpmgsites/in/pdf/2025/11/dpdp-rules-2025-guidance-to-dpdp-act-implementation.pdf); [EY](https://www.ey.com/content/dam/ey-unified-site/ey-com/en-in/alerts-hub/2025/11/digital-data-protection-act-rules-notified-by-meity.pdf)
- The consent notice must be understandable on its own, in clear and plain language, with an itemised description of the personal data, the specified purposes and the goods or services to be provided, and a communication link to the Data Fiduciary's website or app (secondary summary) — [Mondaq](https://www.mondaq.com/india/data-protection/1708164/digital-personal-data-protection-rules-2025-notified)

### Inferences
- Practical reading for Botly, not legal advice: emails needed to deliver the service the user signed up for (sign-in, receipts, service notices) sit comfortably within the purpose of the sign-up; promotional email should rest on a separate, unticked-by-default consent recorded with a timestamp, with withdrawal as easy as giving it (an unsubscribe link satisfies both DPDP and Gmail/Yahoo).
- Botly is in two roles: data fiduciary for its own customers' account data, and data processor for the leads its customers collect through the widget. Lead-notification emails carry third parties' personal data to the business owner; the widget's own notice on the customer's site should say so, and the processing terms belong in Botly's customer agreement.
- Put a physical business address and a working contact address in the footer of every non-auth email; this meets international norms (CAN-SPAM for any overseas recipients) and helps Razorpay and Google brand verification.

### Gaps
- The text of the DPDP Act and Rules on meity.gov.in was not fetched; dates and rule numbers come from law-firm and advisory summaries.
- No authoritative Indian source was found that sets sender-identification or unsubscribe rules specifically for email. TRAI's TCCCPR regime governs SMS and voice commercial communications, and its (non-)application to email was not verified this session.
- Resend stores account data in the US ([Resend: Regions](https://resend.com/docs/dashboard/domains/regions)); whether DPDP cross-border transfer restrictions will affect this depends on government notifications not researched here.

## 12. Step-by-step checklist with order, time and cost

### Takeaway
The whole setup fits in one working day plus DNS waiting time, for roughly Rs 900 to Rs 4,500 in the first year depending on mailbox choice, with Resend staying on its free plan until volume passes 100 emails/day.

### Cited Findings
- Figures used below come from the sources in sections 1, 7 and 8: Resend Free 3,000/month and 100/day, Pro $20/month — [Resend pricing](https://resend.com/pricing); verification up to 72 hours — [Resend: Cloudflare guide](https://resend.com/docs/dashboard/domains/cloudflare); Google MX up to 72 hours — [Google Workspace: MX records](https://knowledge.workspace.google.com/admin/domains/set-up-mx-records-for-google-workspace?hl=en); Supabase custom SMTP 30/hour starting limit — [Supabase: Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp); `.com` about $10.44/year at Cloudflare — [StartupOwl](https://startupowl.com/reviews/cloudflare-registrar); Google Workspace Starter Rs 270/user/month — [Google Workspace India pricing](https://workspace.google.com/intl/en_in/pricing)

### Inferences
Order of operations (time estimates are the researcher's own; costs exclude 18% GST):

| # | Step | Hands-on time | Wait | Cost |
|---|---|---|---|---|
| 1 | Pick name; buy domain (2+ years, auto-renew, lock, 2FA) | 30 min | minutes | `.com` about $10.5/yr (roughly Rs 900); `.in` about $7 to $13/yr |
| 2 | Create free Cloudflare account, add the zone, set nameservers at the registrar (automatic if bought at Cloudflare) | 15 min | up to 24 h | free |
| 3 | Vercel: add apex + `www`, create A (`76.76.21.21` or the value shown) and CNAME (value shown), both DNS-only | 15 min | minutes for SSL | free |
| 4 | Mailbox: sign up for Zoho or Google Workspace, verify domain (TXT), add MX + root SPF, enable the provider's DKIM, create one user with aliases `hello`, `support`, `billing`, `security`, `dmarc`, `admin`, `postmaster`, `abuse` | 45 min | up to 72 h for MX | Zoho Free Rs 0 / Mail Lite about Rs 708/yr / Workspace Starter about Rs 2,720 to 3,240/yr |
| 5 | Resend: add `mail.example.com` (pick region), add the 3 records exactly as shown, click verify | 20 min | minutes to 72 h | free |
| 6 | Add DMARC: `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:dmarc@example.com` | 5 min | - | free |
| 7 | App: change `from` to `Botly <hello@mail.example.com>`, add Reply-To, set base-URL env var, redeploy; send tests to Gmail and check "Show original" for SPF/DKIM/DMARC = PASS | 1 h | - | free |
| 8 | Supabase: SMTP = `smtp.resend.com:465`, user `resend`, password = API key; sender name/address; raise email rate limit above 30/h; Site URL + redirect allow-list; review templates | 30 min | - | free |
| 9 | Google OAuth origins/consent screen, Razorpay webhook + website, widget embed snippet and CORS, keeping the `vercel.app` host live | 1 to 2 h | Razorpay/Google review may take days | free |
| 10 | Monitoring: Resend webhooks for bounces and complaints, Google Postmaster Tools domain verification, a DMARC report reader | 1 h | reports start within 24 to 48 h | free |
| 11 | After 2 to 4 clean weeks: DMARC to `p=quarantine`; after another 2 to 4: `p=reject` | 10 min each | - | free |
| 12 | Before any marketing/newsletter mail: separate subdomain, consent record, List-Unsubscribe one-click headers | half a day | - | free; Resend Pro $20/mo once above 100/day |
| 13 | BIMI: defer | - | - | USD 650 to 1,700/yr if ever done |

- Steps 4 and 5 are independent and can run in parallel; step 6 should follow both so reports show every source. Step 8 must not happen before step 5 verifies, or sign-in emails will fail.
- Until step 5 completes, production email to real customers does not work at all on `onboarding@resend.dev`, so the domain purchase is the blocking item for the entire branded-email plan.

### Gaps
- Time estimates are judgement, not sourced.
- INR totals depend on unconfirmed prices flagged in sections 7 and 8.

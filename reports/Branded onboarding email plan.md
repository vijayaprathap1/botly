# A ten-dollar domain unlocks Botly's branded email

Botly can make every email, including the sign-in link, come from its own address and its own design by doing three things: verify a sending subdomain in Resend, hand Supabase's auth emails to Botly's own code through Supabase's Send Email Hook, and render all mail from one React Email template set in the repo. **The domain is the single blocker, and it is separable from the mailbox**: no route can deliver branded mail to real customers until Botly owns and verifies a domain, but a `.com` costs about $10.5 a year and the paid mailbox can follow later. Until then the work is code, and almost all of it can be finished and tested now: the templates, a new `/auth/confirm` page with a 6-digit code fallback, the hook endpoint (left switched off), and a state-aware onboarding sequence. Domain day itself is then roughly one working day of dashboard work plus DNS waiting time. The research also suggests today's problem is bigger than appearance: Supabase's built-in mailer is documented as limited to 2 emails an hour and to project team addresses, and `onboarding@resend.dev` is widely reported to deliver only to the Resend account owner, so some of Botly's current email is probably not arriving at all. First-year cost is roughly Rs 900 to Rs 4,500 before GST, depending on the mailbox chosen; several of those prices were not confirmed on vendor pages and are flagged below.

## Today's mail is probably failing, not just unbranded

The owner's question is about how the sign-in email looks, but the research points to a delivery problem underneath it. Supabase documents three restrictions on its built-in mailer: it sends "only to pre-authorized addresses" (members of the project's team), it is rate-limited to **2 messages per hour** for the whole project, and it carries no delivery SLA ([Supabase: custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)). If that applies to Botly's project as documented, a stranger typing their email on the login page gets nothing, or the third sign-up in an hour hits "email rate limit exceeded". Google sign-in is unaffected, which may be masking it.

The second problem is the rest of Botly's mail. With `EMAIL_FROM` unset, `lib/notify/email.ts` sends from `onboarding@resend.dev`. Third-party guides quote Resend's API as rejecting such sends to anyone but the account owner with HTTP 403, "You can only send testing emails to your own email address" ([Apidog](https://apidog.com/blog/resend-api-key/), [Achromatic](https://www.achromatic.dev/docs/starter-kits/pro-nextjs-prisma/email/configuration)). **The researchers could not find this restriction on Resend's own pages**, so treat it as likely rather than settled. What Resend does state directly is "You must add and verify at least one domain to send emails with Resend" ([Resend: Domains](https://resend.com/docs/dashboard/domains/introduction)) and that it "requires you own your domain" ([Resend and Supabase](https://www.resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase)). Both readings lead to the same place. The owner can settle it in five minutes: open the Resend dashboard's email log and look for 403s on lead notices and trial emails sent to customers, and try an email sign-in from an address that is not on the Supabase team.

This changes the order of operations. Waiting for "a domain with a professional mailbox" bundles a cheap, blocking item with an optional one. The domain alone is what Resend and Supabase need. A mailbox only matters for receiving replies, and that can start on a free tier or on forwarding. **Buy the domain as soon as the name is chosen; decide on the mailbox afterwards.**

## One template system, with Supabase handing off through a hook

There are three ways to replace Supabase's default auth email, and they differ mainly in who renders the message.

| | A. Custom SMTP + dashboard templates | B. Send Email Hook | C. `generateLink` + own send |
|---|---|---|---|
| Who renders and sends | Supabase, through Resend SMTP | Botly's code, through the Resend API | Botly's code |
| Design control | Static HTML with Go-template variables, edited in the dashboard | Full: React Email, versioned in the repo, shared with all other mail | Full |
| Login page change | None | None | Rewired away from `signInWithOtp` |
| Who rate-limits abuse | Supabase | Supabase | Botly must build it |
| Main risk | Templates live outside the repo | Endpoint must answer in 5 seconds or sign-in fails | Service-role key in the send path, self-built throttling |
| Effort (researcher estimate) | About an hour once DNS verifies | Half a day to a day | One to several days |

Option B is the right destination for Botly. The hook makes Supabase call an HTTPS endpoint with the user and the token instead of sending mail itself, and it is available on the Free and Pro plans ([Supabase: Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)). The endpoint does not have to be a Supabase Edge Function, so a Next.js route handler on Vercel works, sitting beside the existing Resend module. The login page's `signInWithOtp` call stays exactly as it is, and Supabase's 60-second per-user interval and per-IP limits keep protecting it ([Supabase: rate limits](https://supabase.com/docs/guides/auth/rate-limits)). Supabase publishes an official example of this exact stack, React Email plus Resend behind the hook ([Supabase: custom auth emails](https://supabase.com/docs/guides/functions/examples/auth-send-email-hook-react-email-resend)).

Option A is still worth configuring first on domain day, because it is a settings change and becomes the fallback. When the hook is enabled "Auth Hook handles email sending (SMTP not used)"; when it is disabled, SMTP takes over again ([Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)). Saved SMTP settings therefore give a one-click rollback if the hook misbehaves. Option C should be kept for mail the server already initiates, such as the client invite, because the admin `generate_link` endpoint does not appear in Supabase's rate-limit table and public use would put all abuse protection on Botly ([Supabase: rate limits](https://supabase.com/docs/guides/auth/rate-limits)).

### The sign-in email needs a button, a code and a confirm page

Botly's current flow has two documented weaknesses that branding alone does not fix. First, Supabase warns that mail security scanners "prefetch URL links from incoming emails", naming Microsoft Defender Safe Links, which consumes a one-time link before the user clicks ([Supabase: email templates](https://supabase.com/docs/guides/auth/auth-email-templates)). Second, under PKCE "the code exchange must be initiated on the same browser and device where the flow was started" ([Supabase: PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)). A shop owner who types their email on a laptop and opens the message on a phone fails that test.

Supabase's two documented mitigations are to include the 6-digit code, and to link to an app page where the user presses a button to confirm ([Supabase: email templates](https://supabase.com/docs/guides/auth/auth-email-templates)). Botly should do both. The hook payload carries `token` (the code) and `token_hash`, so the email's button can point to `https://<botly-domain>/auth/confirm?token_hash=…&type=email` on Botly's own domain, and that page calls `verifyOtp` only when the user presses "Sign in to Botly" ([Supabase: passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless)). The code is the fallback, typed into a new field on the login page and verified with `verifyOtp({ email, token, type: 'email' })`. A side benefit: the link shows Botly's domain rather than `<project>.supabase.co`, with no need for Supabase's $10-a-month custom domain add-on ([Supabase: custom domain usage](https://supabase.com/docs/guides/platform/manage-your-usage/custom-domains)).

Four implementation points matter for Botly specifically.

- **Post-sign-in logic must be shared.** `/auth/callback` currently grants invited owners access, promotes `ADMIN_EMAILS` and routes new users to `/start`. The new `/auth/confirm` path and the code-entry path must run the same logic, so extract it into one function. Google sign-in keeps using `/auth/callback`.
- **Handle every action type.** Once the hook is on, every auth email goes through it: `signup`, `magiclink`, `invite`, `recovery`, `email_change`, `reauthentication` and the notification types ([Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)). The researchers could not confirm which type a brand-new user created by `signInWithOtp` receives, so `signup` and `magiclink` should render the same sign-in email.
- **Respect the 5-second budget.** HTTP hooks get 5 seconds for the whole call including retries, and there is no automatic fallback to SMTP ([Supabase: Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)). Keep the handler light, verify the Standard Webhooks signature on the raw body, and route failures to the existing admin error alert.
- **Shorten the expiry.** Links and codes last 1 hour by default, set under the Email provider's "Email OTP expiration" ([Supabase: passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless)). Because a `token_hash` link works on any device, the researchers suggest 10 to 15 minutes; that figure is their judgement, not documented guidance.

Two details are unverified and need testing before launch: whether `verifyOtp` accepts type values other than `email` for a hook-delivered hash, and whether Supabase's redirect allow-list matches URLs carrying a `?next=` query string.

## Before the domain: finish the code, test to your own inbox

Everything in this phase is safe to ship because none of it changes what customers receive. Sends from `onboarding@resend.dev` to the owner's own address work for testing, and React Email's preview UI includes a dark-mode switcher and a client-compatibility checker ([React Email changelog](https://react.email/docs/changelog.md)).

| # | Step | Kind | Notes |
|---|---|---|---|
| 1 | Check the Resend log for 403s and test email sign-in from a non-team address | Dashboard (Resend, Supabase) | Confirms whether mail is failing today |
| 2 | Make Google sign-in the prominent option on the login page until domain day | Code | Interim only; the built-in mailer cannot be fixed without a domain |
| 3 | Decide the brand kit: name, one button colour, PNG logo, legal footer text, support contact | Owner decision | Footer content depends on Botly's legal form (see below) |
| 4 | Add React Email; build one shared layout (logo, body, footer) and a plain-text part for every email | Code | React Email 6 ships as a single `react-email` package; plain text now comes from `toPlainText` ([changelog](https://react.email/docs/changelog.md)) |
| 5 | Port the existing emails in `lib/notify/email.ts` to the shared layout; make From and Reply-To come from env vars per mail category | Code | Lead notices should set Reply-To to the lead's address |
| 6 | Build the sign-in email (button, code, expiry, ignore-if-not-you line) | Code | |
| 7 | Build `/auth/confirm` (button page, then `verifyOtp`), the code field on the login page, a resend control with a 60-second countdown, and the shared post-sign-in function | Code | Works with Option A and B alike |
| 8 | Build the hook route handler with signature check and a branch per `email_action_type`; leave the hook disabled in Supabase | Code | Needs a `SEND_EMAIL_HOOK_SECRET` env var later |
| 9 | Make the trial cron state-aware; add the missing emails from the sequence below | Code | |
| 10 | Add a product-tips consent choice at sign-up and store it with a timestamp | Code | Prepares for marketing-stream mail |
| 11 | Sign up to five or six established products with a test address and save their sign-in emails | Owner | The researchers could not verify real senders or copy first-hand |

On step 3, two legal points are unresolved. Section 12(3)(c) of the Companies Act 2013 requires a company's name, registered office address and CIN on business letters and official publications, with penalties for default, but the sources found do not say an automated email footer is caught by it, and the statute text was not opened ([iPleaders](https://blog.ipleaders.in/section-12-of-companies-act-2013/), [TaxGuru](https://taxguru.in/company-law/mca-imposes-penalty-omitting-email-phone-company-letterhead.html)). If Botly is an incorporated company, the cautious course is one grey footer line with those details, confirmed with a CA or CS. If it is a proprietorship, a postal address and contact are still good practice.

## Domain day: a day of dashboards, in a fixed order

The order matters in two places. The Resend domain must verify before Supabase is pointed at it, or sign-in mail fails. And DMARC should be added after both Resend and the mailbox are set up, so reports cover every sender. Time figures are the researchers' estimates.

| # | Step | Where | Kind | Time and wait |
|---|---|---|---|---|
| 1 | Buy the domain for 2+ years; turn on auto-renew, registrar lock and 2FA | Registrar | Dashboard | 30 min |
| 2 | Add the zone to a free Cloudflare account; set nameservers | Cloudflare, registrar | Dashboard | 15 min; up to 24 h |
| 3 | Add apex and `www` to the Vercel project; create the A and CNAME records as "DNS only"; **leave the `vercel.app` domain attached** | Vercel, DNS | Dashboard | 15 min |
| 4 | Set up receiving mail: mailbox provider or forwarding; MX, root SPF, provider DKIM; aliases `hello`, `support`, `billing`, `dmarc`, `postmaster`, `abuse` | Mailbox provider, DNS | Dashboard | 45 min; up to 72 h |
| 5 | Add `mail.<domain>` in Resend; copy its three DNS records exactly; verify; turn click and open tracking off | Resend, DNS | Dashboard | 20 min; minutes to 72 h |
| 6 | Add DMARC: `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:dmarc@<domain>` | DNS | Dashboard | 5 min |
| 7 | Set `EMAIL_FROM`, Reply-To and `NEXT_PUBLIC_APP_URL` on Vercel; redeploy; send tests to Gmail and check "Show original" for SPF, DKIM and DMARC passes | Vercel | Env + deploy | 1 h |
| 8 | Supabase: Site URL and redirect allow-list (new domain, old `vercel.app`, localhost); SMTP to Resend with sender name "Botly"; raise the email rate limit; shorten OTP expiry | Supabase | Dashboard | 30 min |
| 9 | Paste the rendered sign-in HTML into the Confirm sign up, Magic link and Invite templates | Supabase | Dashboard | 30 min |
| 10 | Create the Send Email hook (HTTPS, Botly's route URL), store the secret on Vercel, redeploy, test every flow | Supabase, Vercel | Dashboard + deploy | 1 to 2 h |
| 11 | Update Google OAuth origins and consent screen, Razorpay webhook URL and registered website; issue new widget embed snippets | Google Cloud, Razorpay | Dashboard + code | 1 to 2 h; reviews may take days |
| 12 | Wire Resend bounce and complaint webhooks to a suppression list; register the domain in Google Postmaster Tools | Resend, Google | Code + dashboard | 1 h |
| 13 | After 2 to 4 clean weeks move DMARC to `p=quarantine`, then `p=reject` | DNS | Dashboard | 10 min each |

Several steps carry details worth knowing in advance.

**Domain and DNS (steps 1 to 3).** `.com` is about $10.44 a year at Cloudflare Registrar and `.in` about $7 to $13 elsewhere; Cloudflare does not sell `.in` ([Cloudflare TLD policies](https://www.cloudflare.com/tld-policies/), [StartupOwl](https://startupowl.com/reviews/cloudflare-registrar), [DomainOffer](https://domainoffer.net/tld/in/porkbun)). All registrar prices came from aggregator sites in USD; no INR price was confirmed, and `.in` registrant requirements were not checked. Vercel configures an apex with an A record and a subdomain with a CNAME, using the values its dashboard shows ([Vercel: add a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)).

**Resend (step 5).** Resend asks for an MX and an SPF TXT on a `send` name plus a DKIM TXT at `resend._domainkey`, and says verification can take up to 72 hours though it is usually much faster ([Resend: Cloudflare guide](https://resend.com/docs/dashboard/domains/cloudflare)). Both Resend and Supabase recommend a subdomain over the root to isolate reputation ([Resend: Domains](https://resend.com/docs/dashboard/domains/introduction), [Supabase: custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)). One subdomain for all product mail is enough at Botly's volume. Tokyo is the nearest of Resend's four regions to India; whether the free plan allows that choice was not confirmed ([Resend: regions](https://resend.com/docs/dashboard/domains/regions)). Because Resend's SPF sits on `send.mail`, it never collides with the mailbox provider's SPF on the root.

**Supabase (step 8).** The SMTP values are host `smtp.resend.com`, port `465`, username `resend`, password a Resend API key ([Resend: Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)). Custom SMTP starts with a low hourly cap that Supabase gives as 30 and Resend's guide gives as 25, so read the real value on the Rate Limits page and raise it ([Supabase: custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend and Supabase](https://www.resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase)). Whether any hourly cap still applies once the hook is on was not confirmed.

**The widget (step 11).** Customers' sites load the script from the current `vercel.app` host, so that host must keep serving the script and its API indefinitely. A redirect is not a substitute: the researchers note it generally works for a script GET but breaks POSTs and CORS preflights. The Google and Razorpay steps are standard practice that was not checked against either vendor's current documentation; with Supabase-brokered Google sign-in, the redirect URI is the Supabase project callback and should not change.

**Sender addresses.** Use the product name as the display name, avoid `noreply@` where possible, and send replies to a monitored inbox ([Postmark](https://postmarkapp.com/guides/transactional-email-best-practices)). Gmail asks that messages of one category share one From address ([Google sender guidelines](https://support.google.com/a/answer/81126)). A workable set is `Botly <login@mail.<domain>>` for sign-in, `Botly <hello@mail.<domain>>` for onboarding and trial mail, and `Botly Leads <leads@mail.<domain>>` for lead notices, each with Reply-To on the root domain, since the sending subdomain has no inbound mail.

## Twelve emails, most triggered by what the user did

Established products keep sign-in mail almost bare. In a gallery of 27 captured SaaS login emails the subjects are of the form "Sign in to Miro" or "Your temporary Notion login code", and the genre is described as short, access-focused, one call to action, expiring credential, security reminder ([Sequenzy gallery](https://www.sequenzy.com/email-examples/saas-magic-link)). That gallery belongs to an email-tool vendor and its capture dates are unknown; the researchers could not open real inboxes to verify senders or body copy. Postmark's guidance agrees on the principles: subjects of 50 characters or fewer, a plain-text part that matches the HTML, and precise expiry wording ([Postmark](https://postmarkapp.com/guides/transactional-email-best-practices)).

For Botly the sign-in email should be: logo, one sentence, one button, the 6-digit code beneath it, a line stating the real expiry, a line saying it is safe to ignore if unrequested, and a small footer. No marketing, no social icons. The subject "Sign in to Botly" suits a button-first email; putting the code in the subject is common too, and is a trade-off between lock-screen convenience and exposure, on which no authoritative ruling was found. "Professional" here means restraint: a logo, one colour and good copy, built once in the shared layout so every other email inherits it.

The sequence below maps the researchers' recommended flow onto what Botly already sends. Timings are adapted from vendor frameworks that cite no conversion data, so they are a reasonable starting point rather than proven optima.

| # | Email | Trigger | Status in Botly | Stream |
|---|---|---|---|---|
| 0 | Sign in to Botly | Every login request | Supabase default; replace | Transactional |
| 1 | Welcome | First sign-in | Exists (daily cron); send immediately instead | Transactional |
| 2 | Your assistant is ready | Build completes | New | Transactional |
| 3 | Setup nudge | 24 h without the form done, or 48 h built but not installed | New | Lifecycle |
| 4 | First value | First real visitor conversation answered | New | Lifecycle |
| 5 | 80% of replies used | 40th of 50 replies | Exists; make event-driven | Transactional |
| 6 | Trial ends in 3 days | Day 11 | Exists as "2 days left"; retime | Transactional |
| 7 | Trial ends tomorrow | Day 13 | New | Transactional |
| 8 | Trial ended or replies exhausted | Day 14 or 50th reply | Exists | Transactional |
| 9 | Win-back and feedback | 2 to 3 days after expiry, non-payers only | New | Lifecycle |
| 10 | Payment receipt | Each Razorpay success | New | Transactional |
| 11 | Payment failed | Razorpay failure | New | Transactional |

Three design rules follow from Botly's product. First, **email 2 deserves the most care after the sign-in email**. The import finishes without the tab open, so this message is how many users learn their assistant exists; it should carry the embed step and a test link, and fire from the real build-complete event. If the build finishes within minutes, merge it with the welcome. Second, **every trial email should state both limits**, days left and replies left, because a busy site can exhaust 50 replies well before day 14. That is why emails 5 and 8 must be event-driven rather than calendar-driven. Third, **check state before every send**: skip the nudge if the widget is installed, and exit the trial sequence once the user has paid ([Salesmate](https://support.salesmate.io/hc/en-us/articles/42342694768537-14-Days-Saas-Trial)). Two reminders at about 3 days and 1 day before expiry are recommended over a single late one, which compresses the decision window ([Bento](https://bentonow.com/posts/trial-expiration-email-best-practices)).

If only five can be built, build 0, a merged 1 and 2, 6, 8 and 10.

The stream column governs compliance. Gmail exempts transactional mail such as password resets from one-click unsubscribe and requires it for marketing and subscribed messages from bulk senders, a tier that starts near 5,000 messages a day ([Google sender guidelines FAQ](https://support.google.com/a/answer/14229414?hl=en)). Botly is far below that, but the lifecycle emails (3, 4, 9) should carry an unsubscribe link and rest on the stored consent from the start, and service notices should stay free of promotion so they remain clearly transactional. India's DPDP Rules are reported to bring substantive consent duties into force on **13 May 2027**, about seven months from now; that date comes from law-firm summaries, not the gazette text, and is not legal advice ([Mondaq](https://www.mondaq.com/india/data-protection/1708164/digital-personal-data-protection-rules-2025-notified)). No India-specific email unsubscribe statute was found. Tamil or Hindi versions can come later through the hook, which supports choosing a template from a language stored in `user_metadata` ([Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)).

## First-year cost sits between Rs 900 and Rs 4,500

| Item | Cost | Confidence |
|---|---|---|
| Domain, `.com` | About $10.5 a year (roughly Rs 900) | Aggregator figure; INR not confirmed |
| Cloudflare DNS, Vercel custom domain | Free | Vendor docs |
| Resend Free | $0 for 3,000 emails a month, 100 a day, 3 domains | Read on Resend's pricing page |
| Resend Pro | $20 a month for 50,000 emails, no daily cap | Read on Resend's pricing page |
| Supabase Send Email Hook | Free on Free and Pro plans | Supabase docs |
| Zoho Mail Forever Free | Rs 0, up to 5 users, webmail only | Zoho page; availability on the India data centre unconfirmed |
| Zoho Mail Lite | About Rs 59 a user a month, billed annually (about Rs 708 a year) | Reseller pages only |
| Google Workspace Starter | Rs 270 a user a month; about Rs 2,720 a year on annual commitment | Read on Google's India pricing page; annual total computed |
| Supabase custom domain add-on | $10 a month, paid plans only; optional | Supabase docs |
| BIMI inbox logo | About $650 to $1,700 a year; defer | Secondary sources |

Sources: [Resend pricing](https://resend.com/pricing), [Zoho Mail pricing](https://www.zoho.com/mail/zohomail-pricing.html), [Cloudfy Systems](https://cloudfysystems.com/blog/zoho-mail-pricing-plans-india-2025), [Google Workspace India pricing](https://workspace.google.com/intl/en_in/pricing), [CaptainDNS](https://www.captaindns.com/en/blog/bimi-vmc-cmc-certificate-guide). All figures exclude 18% GST. The Google page also showed an unfamiliar Rs 99 "Base" plan that should be confirmed before relying on it.

The one cost likely to change soon is Resend. Sign-in mail, lead notices, invites and trial emails all draw on the same **100-a-day** free allowance, so a busy day of leads can block sign-in emails. Watch daily volume and move to Pro before it gets close. The Supabase custom domain add-on only matters for what Google's consent screen displays, not for email.

## Conclusion

The request was framed as a design task that must wait for a domain. The research reverses both halves. The design work is the part that can be done today, and the domain is cheap enough that waiting for it costs more than buying it, because until it exists Botly's email sign-in and probably its customer-facing notices are unreliable, not merely plain. The mailbox, which the owner had coupled to the domain, is the only piece that can truly wait.

The other shift is what "like established product companies" turns out to mean. Their sign-in emails are nearly bare; what sets them apart is the plumbing: an authenticated sending subdomain, a link on their own domain, a code that survives scanners and device switches, a reply address someone reads, and emails that react to what the user actually did. Botly already has most of the raw material in one Resend module and a daily cron. The plan above is mostly a matter of putting a shared layout over it, moving Supabase's auth mail into the same path, and replacing calendar triggers with product events.

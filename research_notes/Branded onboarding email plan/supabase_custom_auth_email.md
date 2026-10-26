# Replacing Supabase Auth's default emails with Botly-branded emails (state as of 7 Oct 2026)

Reading notes for the writer:
- All "Cited Findings" were read from the linked primary pages on 7 Oct 2026 through a fetch tool that summarises pages. Text in quotation marks was returned as a quote by that tool; treat the wording as near-verbatim, and re-open the page before copying a number into a contract or a runbook.
- Code under "Inferences" is an illustrative sketch written for these notes. It has not been run. Code under "Cited Findings" is from the cited documentation.
- One blocker applies to every option: Resend needs a verified domain that Botly owns. See the first Gaps entry in the Option A section.

## Option A: custom SMTP (Supabase Auth sends through Resend) and dashboard templates

### Takeaway
This is the quickest win: point Supabase Auth's SMTP settings at `smtp.resend.com` (or use Resend's one-click Supabase integration, which fills the same settings), set the sender name and address there, raise the email rate limit, and paste branded HTML into the dashboard templates. Supabase still renders and triggers the email, so design is limited to static HTML plus Go-template variables, and nothing works for real customers until a domain is verified in Resend.

### Cited Findings
- The built-in Supabase mailer has three restrictions: it sends "only to pre-authorized addresses" (other recipients fail with "Email address not authorized"; authorized means members of the project's team), its rate limit is "currently ... set to 2 messages per hour", and there is "No SLA guarantee on message delivery or uptime for the default SMTP service." — [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- Resend SMTP credentials for Supabase: Host `smtp.resend.com`, Port `465`, Username `resend`, Password = the Resend API key. Prerequisites listed: a Resend API key and a verified domain. — [Resend: Send with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)
- Dashboard path per Resend's guide: Supabase project > **Authentication** > **Email** (under Notifications) > **SMTP Settings**; sender email and sender name are both required fields; paste the Resend credentials; **Save**. — [Resend: Send with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)
- The same settings can be set through the Management API with these fields: `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_admin_email` (the From address), `smtp_sender_name` (the From name), plus `external_email_enabled`, `mailer_secure_email_change_enabled`, `mailer_autoconfirm`. — [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- After custom SMTP is enabled "a low rate-limit of 30 messages per hour is imposed"; it is raised on the Auth **Rate Limits** configuration page. — [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- Resend's own guide gives a different figure for the same default: after SMTP setup "the default is 25 emails/hour", adjustable in the project's authentication settings. — [Resend: Getting started with Resend and Supabase](https://www.resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase); contradicted by [Supabase: custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) (30/hour)
- Supabase lists Resend first among SMTP-compatible providers (also AWS SES, Postmark, Twilio SendGrid, ZeptoMail, Brevo). — [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- There is an official Supabase + Resend integration. Resend describes three ways to use Resend with Supabase: (1) **Resend Integration**, simplest, limited template customisation; (2) **Custom Auth Functions** using React Email or Resend Templates, which requires Supabase Auth Hooks; (3) **Custom SMTP**, which that page frames as for self-hosted Supabase. — [Resend: Getting started with Resend and Supabase](https://www.resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase)
- Integration steps: add the domain on Resend's Domains page (a subdomain is recommended over the root domain), add the DNS records, click "Verify DNS Records" (typically 5 to 10 minutes), open Resend's Integrations settings, click **Connect to Supabase** and authenticate, select the project and the domain, add the API key, enter the sender name and configure the SMTP integration, then confirm in the Supabase dashboard. — [Resend: Getting started with Resend and Supabase](https://www.resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase)
- The integration is also listed on Supabase's partner pages; search-result summaries of those pages say it creates a Resend API key for the project and fills in Supabase's SMTP settings automatically, covering password resets, confirmations, magic links, invitations and email-change emails. (Search snippet only; the partner page itself was not opened.) — [Supabase partners: Resend](https://supabase.com/partners/integrations/resend), [Resend changelog: Supabase Integration](https://resend.com/changelog/supabase-integration)
- "Resend requires you own your domain (i.e., not a shared or public domain)". — [Resend: Getting started with Resend and Supabase](https://www.resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase)
- Resend account limits: free plan "100 emails/day" and "3,000 emails/month" (sent and received both count; each recipient counts separately); "up to 3 verified domains" on free accounts; all accounts start at "10 requests per second" per team; paid plans have no daily limit and a monthly quota set by tier. — [Resend: Account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits)
- Authentication email templates in the dashboard: **Confirm sign up**, **Invite user**, **Magic link or OTP**, **Change email address**, **Reset password**, **Reauthentication**. — [Supabase: Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- There is now a second group, security notification templates: Password changed, Email address changed, Phone number changed, Sign-in method linked, Sign-in method removed, Verification method added, Verification method removed. — [Supabase: Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- Template variables: `{{ .ConfirmationURL }}` (example given: `https://project-ref.supabase.co/auth/v1/verify?token={{ .TokenHash }}&type=email`), `{{ .Token }}` ("a 6-digit One-Time-Password (OTP) that can be used instead of the `{{. ConfirmationURL }}`"), `{{ .TokenHash }}` (hashed version of the token), `{{ .SiteURL }}`, `{{ .RedirectTo }}` (the redirect URL passed to `signUp`, `signInWithOtp`, `signInWithOAuth`, `resetPasswordForEmail` or `inviteUserByEmail`), `{{ .Data }}` (metadata from `auth.users.user_metadata`), `{{ .Email }}`, `{{ .NewEmail }}` (Change email address template only), and notification-only variables `{{ .OldEmail }}`, `{{ .Phone }}`, `{{ .OldPhone }}`, `{{ .Provider }}`, `{{ .FactorType }}`. — [Supabase: Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- Template limitation: email tracking rewrites links, so "disable email tracking to ensure email links are not overwritten". — [Supabase: Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- Supabase's deliverability advice for custom SMTP: set up DKIM, DMARC and SPF; keep auth mail on a different domain or address from marketing mail; keep a backup SMTP service; keep auth messages free of promotional content; do not put unsanitised user-provided data in templates; use the Send Email Auth Hook for advanced control. — [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

### Inferences
- Sender identity for Option A lives in Supabase, not in app code: the Sender email and Sender name fields of SMTP Settings (`smtp_admin_email`, `smtp_sender_name`). The address must be on the domain verified in Resend, for example `Botly <login@auth.botly.example>`.
- Resend's "Custom SMTP is for self-hosted" framing does not mean manual SMTP is blocked on hosted Supabase: Supabase's own page documents it for hosted projects and Resend still publishes the SMTP guide. The integration is just the automated route to the same settings.
- The 30 versus 25 emails/hour conflict does not change the action: open Authentication > Rate Limits after enabling SMTP, read the actual value, and raise it. Supabase's page is the primary source for its own limit.
- Design ceiling of Option A: one static HTML body and subject per template, variables only, no React components, no per-tenant or per-language logic beyond what Go-template conditionals on `{{ .Data }}` allow. Templates live in the dashboard, outside the repo and code review, unless they are pushed through the Management API.
- With the existing `signInWithOtp({ shouldCreateUser: true })` flow, at least two templates need branding: the one for first-time users and the one for returning users (see the Gaps entry below about which template a new user receives). Brand Confirm sign up, Magic link or OTP, and Invite user together to be safe.
- The free Resend plan (100/day) is a real ceiling for sign-in mail because the app's lead notifications, invites and trial emails share the same quota.

### Gaps
- Could not confirm from a primary source in this session the widely reported rule that mail from `onboarding@resend.dev` is only delivered to the Resend account owner's own address. The pages read say a verified, owned domain is a prerequisite for the Supabase setup, which leads to the same conclusion: no option here can send sign-in mail to real customers until the domain is bought and verified. Confirm against Resend's domain docs before planning around it.
- Could not confirm from a primary source which template a brand-new user receives when `signInWithOtp` creates the account (commonly reported: Confirm sign up when "Confirm email" is on, Magic link for existing users). The Send Email hook docs list both `signup` and `magiclink` as `email_action_type` values, which is consistent with that, but it was not stated outright.
- Resend also documents SMTP ports other than 465 (for example 587 and 2465/2587); only 465 appears in the Supabase guide that was read. Not verified here.
- Did not open the Supabase partner page for the integration, so its exact scope (for example whether it also raises the Supabase rate limit) is unconfirmed. The search snippet's claim of "production-ready send limits" was not verified.
- Whether the dashboard template editor has changed layout in 2026 (path names such as "Authentication > Email" versus "Authentication > Emails > Templates") was not checked in a live dashboard.

## Option B: the Send Email Auth Hook (the app renders and sends every auth email)

### Takeaway
The hook makes Supabase Auth call an HTTPS endpoint (or a Postgres function) with the user and the token instead of sending mail itself; the endpoint renders any design (React Email) and sends through Resend's HTTP API. It is available on Free and Pro, replaces SMTP while enabled, keeps the existing `signInWithOtp` client code unchanged, and its main risk is that the endpoint must answer within 5 seconds or sign-in fails.

### Cited Findings
- Purpose: the hook lets you "replace Supabase's built-in email sending" in order to send with your own provider, add internationalisation or custom logic, or fall back to another provider. — [Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- Plan availability: Send Email, Send SMS, Custom Access Token and Before User Created hooks are on Free and Pro; MFA Verification Attempt and Password Verification Attempt are Team and Enterprise only. — [Supabase: Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- Two hook types: an HTTP endpoint, or a Postgres function (the documented Postgres pattern only queues a job row and processes it with `pg_cron`; `config.toml` uses a `pg-functions://...` URI). — [Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook), [Supabase: Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- Relationship to SMTP: Email provider enabled + hook enabled = "Auth Hook handles email sending (SMTP not used)"; Email provider enabled + hook disabled = "SMTP handles email sending"; Email provider disabled = email signups disabled regardless of the hook. — [Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- Payload shape (documented example, abridged):
  ```json
  {
    "user": { "id": "8484b834-...", "aud": "authenticated", "role": "authenticated",
              "email": "valid.email@supabase.io", "phone": "",
              "app_metadata": { "provider": "email", "providers": ["email"] },
              "user_metadata": { "email": "...", "email_verified": false, "sub": "..." },
              "identities": [ ... ], "created_at": "...", "updated_at": "...", "is_anonymous": false },
    "email_data": {
      "token": "305805",
      "token_hash": "7d5b7b1964cf5d388340a7f04f1dbb5eeb6c7b52ef8270e1737a58d0",
      "redirect_to": "http://localhost:3000/",
      "email_action_type": "signup",
      "site_url": "http://localhost:9999",
      "token_new": "", "token_hash_new": "",
      "old_email": "", "old_phone": "", "provider": "", "factor_type": ""
    }
  }
  ```
  — [Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- `email_action_type` values: `signup`, `invite`, `magiclink`, `recovery`, `email_change`, `email`, `reauthentication`, and notification types `password_changed_notification`, `email_changed_notification`, `phone_changed_notification`, `identity_linked_notification`, `identity_unlinked_notification`, `mfa_factor_enrolled_notification`, `mfa_factor_unenrolled_notification`. — [Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- Email change with Secure Email Change enabled produces two OTPs and needs two emails, with a counter-intuitive mapping: "token_hash_new → use with the current email address (user.email) and token; token_hash → use with the new email address (user.new_email) and token_new". With it disabled there is a single OTP for the new address. — [Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- Verification URL format to build yourself: `https://{PROJECT_REF}.supabase.co/auth/v1/verify?token={token_hash}&type={email_action_type}&redirect_to={redirect_to}`. — [Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- Webhook verification follows the Standard Webhooks spec. Headers: `webhook-id`, `webhook-timestamp` (UNIX seconds), `webhook-signature`. Secret format: `v1,whsec_<base64-secret>`; the docs strip the `v1,whsec_` prefix before constructing `new Webhook(secret)` from the `standardwebhooks` package and then call `wh.verify(payload, headers)` on the raw request text. — [Supabase: Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks), [Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- Limits and failure behaviour: HTTP hooks have "5 seconds" for the entire invocation including retries; Postgres hooks have "2 seconds". Retries: "up to three retries with a back-off of two seconds", only for status 429 and 503 with a non-empty `retry-after` header. Status 200, 202, 204 are success; 400 and 403 are treated as internal server errors (500). Responses must have `Content-Type: application/json`. Payloads are uncompressed with a 20KB maximum. — [Supabase: Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- Send Email response contract: "No outputs are required. An empty response with a status code of 200 is taken as a successful response"; the documented error body is `{ "error": { "http_code": <code>, "message": "<text>" } }`. — [Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- Configuration: dashboard **Authentication > Hooks**, create a "Send Email hook" of type HTTPS, paste the endpoint URL, generate the secret, create the hook. Local/CLI form:
  ```toml
  [auth.hook.send_email]
  enabled = true
  uri = "http://host.docker.internal:54321/functions/v1/send-email"
  secrets = "env(SEND_EMAIL_HOOK_SECRET)"
  ```
  (the docs show the generic form `[auth.hook.<hook_name>]` with a send_sms example). — [Supabase: Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks), [Supabase: Custom Auth Emails with React Email and Resend](https://supabase.com/docs/guides/functions/examples/auth-send-email-hook-react-email-resend)
- Rate limits: the row "Emails sent by Supabase Auth" (project-wide, "2 emails per hour with the built-in email provider") lists its customisation route as "Custom SMTP or Send Email hook". — [Supabase: Rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- Official Edge Function example (React Email + Resend), current version of the docs:
  ```tsx
  // supabase/functions/send-email/index.ts
  import { renderAsync } from 'npm:@react-email/components@^1'
  import { withSupabase } from 'npm:@supabase/server@^1'
  import React from 'npm:react@^19'
  import { Resend } from 'npm:resend@^6'
  import { Webhook } from 'npm:standardwebhooks@^1'
  import { MagicLinkEmail } from './_templates/magic-link.tsx'

  const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string)
  const hookSecret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') as string).replace('v1,whsec_', '')

  export default {
    fetch: withSupabase({ auth: 'none' }, async (req) => {
      if (req.method !== 'POST') return Response.json({ error: 'not allowed' }, { status: 400 })
      const payload = await req.text()
      const headers = Object.fromEntries(req.headers)
      const wh = new Webhook(hookSecret)
      try {
        const { user, email_data: { token, token_hash, redirect_to, email_action_type } } =
          wh.verify(payload, headers) as { user: { email: string }; email_data: { token: string; token_hash: string; redirect_to: string; email_action_type: string; site_url: string; token_new: string; token_hash_new: string } }
        const html = await renderAsync(
          React.createElement(MagicLinkEmail, {
            supabase_url: Deno.env.get('SUPABASE_URL') ?? '',
            token, token_hash, redirect_to, email_action_type,
          })
        )
        const { error } = await resend.emails.send({
          from: 'welcome <onboarding@resend.dev>', to: [user.email],
          subject: 'Supa Custom MagicLink!', html,
        })
        if (error) throw error
      } catch (error) {
        return Response.json({ error: { http_code: error.code, message: error.message } }, { status: 401 })
      }
      return Response.json({})
    }),
  }
  ```
  The template builds the link as `${supabase_url}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to}` and also prints `{token}` as "Or, copy and paste this temporary login code". Commands: `supabase functions new send-email`, `supabase functions deploy send-email --no-verify-jwt`, `supabase secrets set --env-file supabase/functions/.env` with `RESEND_API_KEY` and `SEND_EMAIL_HOOK_SECRET="v1,whsec_<base64_secret>"`. — [Supabase: Custom Auth Emails with React Email and Resend](https://supabase.com/docs/guides/functions/examples/auth-send-email-hook-react-email-resend)
- An older variant of the same example on the hook page uses `import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0"` with `Deno.serve(...)`, and an i18n example picks the language from `user.user_metadata.i18n` and has a `generateConfirmationURL(email_data)` helper that builds the `/auth/v1/verify` URL with `URLSearchParams`. — [Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)

### Inferences
- Recent change to flag: the Edge Function example now uses `withSupabase({ auth: 'none' }, ...)` from `npm:@supabase/server@^1` with an `export default { fetch }` shape, `resend@^6` and `@react-email/components@^1`, while the hook reference page still shows the older `Deno.serve` + `esm.sh` form. Both forms are in the live docs; tutorials older than 2026 will show only the old one.
- The hook does not need to be a Supabase Edge Function. Any public HTTPS URL works, so a Next.js route handler on Vercel can be the hook, which keeps the email templates in the Botly repo next to the existing Resend code. Illustrative sketch (not run; adapted from the documented example):
  ```ts
  // app/api/auth/send-email/route.ts  (illustrative, untested)
  import { Webhook } from 'standardwebhooks'
  import { Resend } from 'resend'
  import { render } from '@react-email/components'
  import { SignInEmail } from '@/emails/sign-in'

  export const runtime = 'nodejs'
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const secret = process.env.SEND_EMAIL_HOOK_SECRET!.replace('v1,whsec_', '')

  export async function POST(req: Request) {
    const payload = await req.text()                      // raw body, before any JSON parsing
    const headers = Object.fromEntries(req.headers)
    let event: { user: { email: string }; email_data: {
      token: string; token_hash: string; redirect_to: string;
      email_action_type: string; site_url: string } }
    try {
      event = new Webhook(secret).verify(payload, headers) as typeof event
    } catch {
      return Response.json({ error: { http_code: 401, message: 'invalid signature' } }, { status: 401 })
    }
    const { user, email_data: d } = event
    // Link on Botly's own domain, verified by /auth/confirm with verifyOtp({ token_hash, type })
    const url = new URL('/auth/confirm', process.env.NEXT_PUBLIC_SITE_URL)
    url.searchParams.set('token_hash', d.token_hash)
    url.searchParams.set('type', 'email')                 // see the note on type values below
    url.searchParams.set('next', d.redirect_to)           // validate against an allow-list in /auth/confirm
    const html = await render(SignInEmail({ url: url.toString(), code: d.token, action: d.email_action_type }))
    const { error } = await resend.emails.send({
      from: 'Botly <login@auth.botly.example>', to: [user.email],
      subject: `${d.token} is your Botly sign-in code`, html,
    })
    if (error) return Response.json({ error: { http_code: 500, message: error.message } }, { status: 500 })
    return Response.json({})
  }
  ```
- The 5-second budget covers the whole call, so a Vercel cold start plus React Email rendering plus the Resend API call must fit inside it. If it does not, the user's `signInWithOtp` call fails. Keep the handler small, avoid heavy imports, and consider a plain HTML string fallback. There is no built-in fallback to SMTP while the hook is enabled.
- The handler must branch on `email_action_type`. Once the hook is on, every auth email goes through it, including `recovery`, `email_change`, `invite`, `reauthentication` and the `*_notification` types if those are enabled. Unhandled types should still send a sensible generic email or return 200 deliberately.
- Because the hook receives `token_hash`, the link can point at Botly's own domain instead of `<project>.supabase.co`, which removes the need for the custom domain add-on for email links (see the custom domain section).
- The hook is the option that gives full design control later: per-tenant branding, Hindi or other languages from `user_metadata`, and one template system shared with the existing Resend emails.
- Supabase's per-user 60-second send interval and per-IP limits still protect the trigger endpoint, because the client still calls Supabase Auth and Supabase calls the hook. Abuse protection stays with Supabase, unlike Option C.

### Gaps
- Not confirmed whether a separate numeric "emails per hour" cap still applies once the hook is enabled. The rate-limit table says the built-in 2/hour cap is lifted by "Custom SMTP or Send Email hook", and the 30/hour figure is documented only for custom SMTP. Check the Authentication > Rate Limits page after enabling the hook.
- Not confirmed which `type` values `verifyOtp` accepts for a hook-delivered `token_hash`. The docs' own-domain examples use `type=email` for sign-in and signup links and `type=invite` for invites; whether passing `magiclink` or `signup` straight from `email_action_type` still works (those values are reported as deprecated in `EmailOtpType`) was not verified.
- No documented statement was found on how Supabase surfaces a hook failure to the client (error code and message returned by `signInWithOtp`).
- Edge Function pricing/invocation quotas for hosting the hook on Supabase were not researched; a Vercel route handler avoids that question.

## Option C: generating links yourself with `auth.admin.generateLink`

### Takeaway
The app can skip Supabase's sending path entirely: a server route calls `supabase.auth.admin.generateLink(...)` with the service-role (secret) key, gets back a link, a hashed token and a 6-digit code, emails them through Resend, and a `/auth/confirm` route completes sign-in with `verifyOtp({ token_hash, type })`. This gives the same design freedom as the hook but moves abuse protection, rate limiting and user-enumeration handling into Botly's code, so it is best kept for server-initiated mail such as team invites.

### Cited Findings
- `generateLink` "Generates email links and OTPs to be sent via a custom email provider." Types: `signup` (takes `email` and `password`, optional `data`), `invite`, `magiclink`, `recovery`, `email_change_current`, `email_change_new` (the last two take `newEmail`). Options include `redirectTo` and `data`. — [Supabase JS reference: auth.admin.generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
- Example calls: `supabase.auth.admin.generateLink({ type: 'magiclink', email: 'email@example.com' })`, `({ type: 'invite', email })`, `({ type: 'recovery', email })`, `({ type: 'signup', email, password: 'secret' })`. — [Supabase JS reference: auth.admin.generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
- Response `properties`: `action_link`, `email_otp`, `hashed_token`, `redirect_to`, `verification_type` (alongside the user object). — [Supabase JS reference: auth.admin.generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
- Implementation: the client POSTs to `${url}/admin/generate_link`; the source doc comment reads "Generates email links and OTPs to be sent via a custom email provider" with `options.password` and `options.data` "For signup only" and `options.redirectTo` "The redirect url which should be appended to the generated link". — [supabase/auth-js: GoTrueAdminApi.ts](https://raw.githubusercontent.com/supabase/auth-js/master/src/GoTrueAdminApi.ts)
- Server-side verification route documented for Next.js with `@supabase/ssr`:
  ```ts
  // app/auth/confirm/route.ts
  import { type EmailOtpType } from '@supabase/supabase-js'
  import { redirect } from 'next/navigation'
  import { type NextRequest } from 'next/server'
  import { createClient } from '@/utils/supabase/server'

  export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type') as EmailOtpType | null
    const next = searchParams.get('next') ?? '/'
    if (token_hash && type) {
      const supabase = await createClient()
      const { error } = await supabase.auth.verifyOtp({ type, token_hash })
      if (!error) redirect(next)
    }
    redirect('/auth/auth-code-error')
  }
  ```
  — [Supabase: Password-based auth (PKCE / server-side section)](https://supabase.com/docs/guides/auth/passwords)
- A reported pitfall: calling `generateLink()` repeatedly for the same user returned the same OTP, and after the first successful `verifyOtp()` later attempts failed with "Database error finding user from email link"; the issue was closed as not planned with no maintainer answer captured. Reported on supabase-js v2.33.2, so it may be outdated. — [supabase/gotrue issue #1357](https://github.com/supabase/gotrue/issues/1357)
- Supabase's IP-based limits are attached to its public endpoints (`/auth/v1/otp`, `/auth/v1/magiclink`, `/auth/v1/signup`, `/auth/v1/recover`, `/auth/v1/resend`), and the per-user 60-second window is documented for `/auth/v1/otp`, `/auth/v1/signup` and `/auth/v1/recover`; the admin `generate_link` endpoint is not in the rate-limit table. — [Supabase: Rate limits](https://supabase.com/docs/guides/auth/rate-limits)

### Inferences
- PKCE interaction: `generateLink` runs on the server with no browser-held code verifier, so the returned `action_link` cannot complete the PKCE `?code=` exchange that Botly's `/auth/callback` expects. The workable pattern is to ignore `action_link` and build `https://<app>/auth/confirm?token_hash=<hashed_token>&type=<type>&next=<path>`, then call `verifyOtp` in the route above, which sets the session cookies through `@supabase/ssr`. This matches common community guidance; no primary-source sentence stating "generateLink does not support PKCE" was captured in this session.
- Since the admin endpoint is absent from the rate-limit table, an app endpoint that wraps `generateLink` for public sign-in must add its own controls: per-email and per-IP throttling (for example the same 60-second per-address interval Supabase applies), a CAPTCHA or equivalent on the form, identical responses whether or not the address exists, a daily send budget so an attacker cannot burn the Resend quota or mail-bomb third parties, and strict allow-listing of the `next`/`redirectTo` value to prevent open redirects.
- The service-role (secret) key must only be used in server code (route handlers or server actions), never shipped to the browser.
- `magiclink` generation for an address with no account, and how `shouldCreateUser`-style behaviour maps onto `generateLink` (magiclink versus signup, which requires a password), would need a create-user step in app code. That is extra logic the hook route does not need.
- Good fit for Option C: emails the server already initiates, such as Botly's existing team invites and trial emails, where a one-click sign-in link can be embedded in an email the app is sending anyway. Poor fit: replacing the public sign-in form's send path, where Option B gives the same result with Supabase still doing rate limiting.

### Gaps
- Exact response JSON for `generateLink` (full example) was not captured; only the property names were.
- Whether the same-OTP behaviour in gotrue issue #1357 still occurs on current Auth versions is unknown.
- Whether `generateLink` invalidates a previously issued token for the same user, and whether generated tokens follow the "Email OTP expiration" setting, was not confirmed from documentation.
- No primary source was found that enumerates rate limits (if any) on `/admin/generate_link`.

## Magic link versus 6-digit code versus both in one email; link prefetching; PKCE same-device limits

### Takeaway
Supabase treats the magic link and the 6-digit code as the same token shown two ways, so one email can carry both a button and a code. Supabase documents that mail security scanners can consume one-time links, and its two mitigations are a code typed into the app or a link to an app page where the user clicks a button; a link built on `token_hash` also removes the PKCE requirement that the link be opened in the browser that requested it.

### Cited Findings
- "Email OTPs share an implementation with Magic Links. To send an OTP instead of a Magic Link, alter the Magic Link email template", for example `<p>Please enter this code: {{ .Token }}</p>`; the two methods "differ only in the content of the confirmation email sent to the user." — [Supabase: Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- Code verification call: `supabase.auth.verifyOtp({ email, token, type: 'email' })`. — [Supabase: Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- Prefetching problem as documented: "Certain email providers may have spam detection or other security features that prefetch URL links from incoming emails", naming "Safe Links in Microsoft Defender for Office 365"; the result is that the token is consumed before the user clicks. — [Supabase: Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- Documented mitigation 1: "Use an email OTP instead by including `{{ .Token }}` in the email template" and send the user to a page where they enter their email and the token. — [Supabase: Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- Documented mitigation 2: "Create your own custom email link to redirect the user to a page where they can click on a button to confirm the action", for example `<a href="{{ .SiteURL }}/confirm-signup?confirmation_url={{ .ConfirmationURL }}">Confirm email address</a>`. — [Supabase: Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- For PKCE/server-side apps, the documented Magic Link template is `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a>`, exchanged with `verifyOtp()`; the signup variant is `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`; a generic server-endpoint example is `https://api.example.com/v1/authenticate?token_hash={{ .TokenHash }}&type=invite&redirect_to={{ .RedirectTo }}`. — [Supabase: Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Supabase: Password-based auth](https://supabase.com/docs/guides/auth/passwords), [Supabase: Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- PKCE constraints: "The code verifier is created and stored locally when the Auth flow is first initiated. That means the code exchange must be initiated on the same browser and device where the flow was started." The code "has a validity of 5 minutes and can only be exchanged for an access token once." — [Supabase: PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- Supabase's own React Email example puts both in one email: a link, then "Or, copy and paste this temporary login code" with `{token}`. — [Supabase: Custom Auth Emails with React Email and Resend](https://supabase.com/docs/guides/functions/examples/auth-send-email-hook-react-email-resend)

### Inferences
- Botly's current flow (default `{{ .ConfirmationURL }}` to Supabase's `/auth/v1/verify`, then `?code=` to `/auth/callback` and `exchangeCodeForSession`) has both weaknesses at once: a scanner's GET consumes the token, and a user who requests the link on a laptop but opens the email on a phone has no code verifier, so the exchange fails. Indian small-business owners commonly read email on a phone, so the cross-device case is likely to be frequent.
- A `token_hash` link to a GET route that immediately calls `verifyOtp` fixes the cross-device problem but not prefetching: a scanner's GET still consumes the token. To cover both, the link should land on a page that shows a "Sign in to Botly" button and only calls `verifyOtp` on the button's POST (a server action), and the email should also show the 6-digit code with a code-entry box on the sign-in page as the fallback.
- A `token_hash` sign-in creates the session in whichever browser opens the link, not the one that requested it. That is the intended trade-off, but it means anyone holding the email link can sign in on their own device; short expiry matters more.
- Recommended email shape under any option: primary button (own-domain `token_hash` link to a confirm page), the code in large type, expiry stated in plain words, and the code in the subject line so it is visible in notifications.
- Under Option A this is done with `{{ .TokenHash }}` and `{{ .Token }}` in the dashboard template; under Option B with `email_data.token_hash` and `email_data.token`; under Option C with `hashed_token` and `email_otp`.

### Gaps
- No Supabase GitHub discussion or issue on link prefetching was opened in this session; the findings rest on the official template docs, which describe the problem and both mitigations.
- No measured data on how often scanners consume Supabase links (rates by mail provider) was found.
- Whether Gmail or Indian mail providers (for example Rediffmail, Zoho Mail) prefetch links was not researched.

## OTP expiry, single use, send interval and "email rate limit exceeded"

### Takeaway
Links and codes are single-use, expire after 1 hour by default (one setting governs every email link type), and a user can request a new one only every 60 seconds; the "email rate limit exceeded" error on the built-in mailer is the project-wide cap of 2 emails per hour, which only custom SMTP or the Send Email hook lifts.

### Cited Findings
- "By default, a user can only request a magic link once every 60 seconds and they expire after 1 hour." The same is stated for OTPs. — [Supabase: Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- Expiry is set at **Authentication > Sign In / Providers > Auth Providers > Email > Email OTP expiration**; "The Email OTP Expiration setting also governs the validity of Magic Links and other email links, including confirmation, password recovery, email change, and invitation links." A maximum of 86,400 seconds (one day) is allowed and durations that long are discouraged. — [Supabase: Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- "Magic Links only work with email addresses and are one-time use only." The email OTP is described as "a six-digit code". — [Supabase: Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- Rate-limit table (hosted defaults):
  - Emails sent by Supabase Auth: per project, "2 emails per hour with the built-in email provider"; customisable only via "Custom SMTP or Send Email hook".
  - Sign-ups and sign-ins (`/auth/v1/signup`, `/auth/v1/recover`, `/auth/v1/resend`, `/auth/v1/magiclink`, `/auth/v1/otp`, `/auth/v1/user`): per IP, "30 requests per 5 minutes, with bursts up to 30 requests"; customisable.
  - Send OTPs or magic links (`/auth/v1/otp`): per user, "60 seconds window before a new request is allowed for the same user"; customisable. Same 60-second per-user window for `/auth/v1/signup` and `/auth/v1/recover`.
  - Verification requests (`/auth/v1/verify`): per IP, "30 requests per 5 minutes, with bursts up to 30 requests"; customisable.
  - Token endpoint (`/auth/v1/token`): per IP, "150 requests per 5 minutes, with bursts up to 30 requests"; customisable.
  — [Supabase: Rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- The error surfaced is code `over_email_send_rate_limit`, message "email rate limit exceeded", HTTP 429. (From a search-result summary of a GitHub bug report and third-party posts, not from an official error-code page.) — [supabase/supabase issue #34136](https://github.com/supabase/supabase/issues/34136)
- `shouldCreateUser`: when set to `false`, existing users can sign in and no new account is created. — [Supabase: Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless)

### Inferences
- Two different limits produce "rate limit" errors and the UI should distinguish them: the project-wide hourly email cap (fixed by Option A or B) and the per-user 60-second interval (stays in place; the sign-in form should show a countdown before "Resend").
- Customisable limits are edited on the dashboard's Authentication > Rate Limits page; the per-user interval and the OTP expiry sit with the Email provider settings.
- With a `token_hash` link that any device can use and a 6-digit code that can be guessed, a shorter expiry than the 1-hour default (for example 10 to 15 minutes) is prudent; the per-IP limit of 30 verification requests per 5 minutes is the documented guard against code guessing.
- Verification through the app's own `/auth/confirm` route calls Supabase from Vercel's servers, so Supabase's per-IP verification limit may see Vercel egress addresses rather than end users. Not documented either way; worth watching in logs.

### Gaps
- The exact dashboard label for the per-user send interval (commonly "Minimum interval per user" or similar) and whether email OTP length is configurable (commonly 6 to 10 digits) were not confirmed from the pages read.
- The official error-codes page was not opened, so `over_email_send_rate_limit` is not confirmed from primary documentation.
- Whether a successful hook delivery counts against any hourly email limit is unconfirmed (same gap as in Option B).

## Supabase URL configuration for production and localhost

### Takeaway
Set **Site URL** to the production origin and list every redirect target (production callback/confirm paths, localhost, Vercel previews) in the redirect allow-list; a `redirectTo` that is not on the list is ignored in favour of the Site URL.

### Cited Findings
- Site URL is the "default redirect URL when no `redirectTo` is specified in the code"; the development default is `http://localhost:3000` and it should be changed to the production domain. — [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- The `redirectTo` value passed for passwordless sign-ins or third-party providers must match an entry in the Redirect URLs allow-list. — [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- Wildcards: `*` matches any sequence of non-separator characters, `**` matches any sequence of characters, `?` matches one non-separator character; separators are `.` and `/`. Examples: `http://localhost:3000/**`, and for Vercel previews `https://*-<team-or-account-slug>.vercel.app/**`. — [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- "While the 'globstar' (`**`) is useful for local development and preview URLs, we recommend setting the exact redirect URL path for your site URL in production." — [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- When using `redirectTo`, templates should use `{{ .RedirectTo }}` in place of `{{ .SiteURL }}`; the docs also give a helper that derives the URL from `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_VERCEL_URL`. — [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

### Inferences
- Suggested values for Botly: Site URL = `https://<botly-domain>`; allow-list = `https://<botly-domain>/auth/callback` (Google OAuth and the current flow), `https://<botly-domain>/auth/confirm` if the `token_hash` route is added, `http://localhost:3000/**`, and the Vercel preview pattern. The current `emailRedirectTo` carries a `?next=...` query, so confirm in testing that the exact-path entries match URLs with query strings, or use a `/**` suffix on those entries.
- `{{ .SiteURL }}` (or `email_data.site_url` in the hook) always points to production, so emails triggered from localhost or a preview deployment will link to production unless the template uses `{{ .RedirectTo }}` / `redirect_to` to derive the origin. In a hook handler, deriving the origin from `redirect_to` (after checking it against an allow-list) keeps local testing working.
- Google OAuth is unaffected by any of the three email options but shares this allow-list.

### Gaps
- Whether allow-list matching ignores query strings was not confirmed from the page.
- The current dashboard path (Authentication > URL Configuration) was not checked in a live project.

## Custom auth domain versus links on the app's own domain

### Takeaway
Supabase's custom domain add-on ($10 per month, paid plans only) replaces `<project>.supabase.co` everywhere, including the Google consent screen, but email links can be moved to Botly's own domain for free by building them from `token_hash` and verifying in an app route.

### Cited Findings
- Custom domains are "available as a paid add-on for projects on a paid plan"; the use cases named are the project URL being "shown on the OAuth consent screen" and APIs offered to third parties. — [Supabase: Custom domains](https://supabase.com/docs/guides/platform/custom-domains)
- Price: "$0.0137 per hour ($10 per month)", billed hourly with partial hours rounded up, and "Custom Domains are not covered by the Spend Cap". — [Supabase: Manage custom domain usage](https://supabase.com/docs/guides/platform/manage-your-usage/custom-domains)
- Setup: `supabase domains create --project-ref [ID] --custom-hostname api.example.com`, then `supabase domains reverify --project-ref [ID]`, then `supabase domains activate --project-ref [ID]`; DNS needs a CNAME from the custom hostname to the Supabase project domain and a TXT record at `_acme-challenge.<your-custom-domain>`. — [Supabase: Custom domains](https://supabase.com/docs/guides/platform/custom-domains)
- Before activation, add the custom-domain Auth callback URL to each OAuth provider "in addition to the Supabase project URL"; after activation "The project's Supabase domain remains active". — [Supabase: Custom domains](https://supabase.com/docs/guides/platform/custom-domains)
- Vanity subdomains (for example `my-example-brand.supabase.co`) are an experimental alternative requiring a paid plan (Pro/Team/Enterprise), configured with `vanity-subdomains` CLI commands and the `--experimental` flag. — [Supabase: Custom domains](https://supabase.com/docs/guides/platform/custom-domains)
- Own-domain links without the add-on: templates may link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`, and the hook payload exposes `token_hash` for the same purpose. — [Supabase: Passwordless email logins](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)

### Inferences
- For the email problem alone the add-on is unnecessary: a `token_hash` link shows only Botly's domain, under any of the three options.
- The add-on is the only way to change what Google's sign-in consent screen shows ("continue to `<project>.supabase.co`"), so it becomes relevant when the Google OAuth experience is polished, and it requires the project to be on a paid plan plus $10 per month.
- Links whose visible domain matches the sender's domain are generally better for deliverability and user trust than a sender on Botly's domain with a link to `supabase.co`.

### Gaps
- Whether the vanity subdomain carries an extra charge was not stated on the page read.
- Current Supabase plan prices were not researched; only the add-on price was.

## Comparison and recommendation

### Takeaway
Do Option A now (it is a settings change once a domain is verified) with a `token_hash` link plus a 6-digit code in the template, and move to Option B when full design control, localisation or per-tenant branding is wanted; keep Option C for server-initiated emails such as invites, not for the public sign-in form.

### Cited Findings
- Resend itself ranks the routes the same way: the integration (SMTP) is the "simplest setup" with "limited email template customization", while custom auth functions via Auth Hooks give "more control over templates using React Email or Resend Templates". — [Resend: Getting started with Resend and Supabase](https://www.resend.com/docs/knowledge-base/getting-started-with-resend-and-supabase)
- Supabase's SMTP page points to the Send Email Auth Hook for advanced scenarios needing custom control. — [Supabase: Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- The Send Email hook is available on Free and Pro plans. — [Supabase: Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- Hook enabled means SMTP is not used; hook disabled means SMTP is used. — [Supabase: Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- Costs that are documented: Resend free plan 100 emails/day and 3,000/month; Supabase custom domain add-on $10/month (optional). — [Resend: Account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits), [Supabase: Manage custom domain usage](https://supabase.com/docs/guides/platform/manage-your-usage/custom-domains)

### Inferences
Comparison table (judgements derived from the findings above; effort figures are estimates, not sourced):

| | A. Custom SMTP + dashboard templates | B. Send Email hook | C. `generateLink` + own send |
|---|---|---|---|
| What changes | Supabase settings only; optional `/auth/confirm` route | One hook endpoint (Vercel route or Edge Function) + email components; optional `/auth/confirm` | New server send endpoint, `/auth/confirm`, sign-in form rewired away from `signInWithOtp`, own throttling |
| Effort (estimate) | About an hour after DNS verifies | About half a day to a day, including all action types and testing | One to several days, mostly abuse protection and edge cases |
| Extra cost | None beyond Resend plan | None beyond Resend plan (hook is on Free/Pro) | None beyond Resend plan |
| Design control | Static HTML + Go-template variables, edited in dashboard | Full: React Email, per-tenant, per-language, shared with other Botly emails, versioned in repo | Full, same as B |
| Sender name/address set in | Supabase SMTP Settings | `from` field in app code | `from` field in app code |
| Deliverability | Resend + verified domain (SPF/DKIM/DMARC) | Same, plus Resend API features (tags, tracking control, idempotency) | Same as B |
| Who rate-limits the send | Supabase (60s per user, per-IP limits, hourly email cap that must be raised) | Supabase (same trigger limits) | The app must do all of it |
| Client code change | None | None | Yes, sign-in form calls the app's endpoint |
| Main risk | Low. Templates live outside the repo; limited design | Medium. Hook must answer in 5s or sign-in fails; must handle every `email_action_type`; no automatic SMTP fallback | Highest. Service-role key in the send path, self-built throttling and enumeration protection, PKCE not usable, reported same-OTP quirk |
| Reversible | Yes, clear SMTP settings | Yes, disable hook and SMTP takes over again | Requires code rollback |
| Works before a domain is verified | No | No | No |

- Recommended path for a small team: (1) buy and verify a sending subdomain in Resend; (2) Option A via the Resend-Supabase integration, set sender name "Botly", raise the email rate limit, replace the Confirm sign up, Magic link or OTP and Invite user templates with branded HTML that has an own-domain `token_hash` button and the `{{ .Token }}` code; (3) add `/auth/confirm` (button-confirm page + `verifyOtp`) and a code-entry field on the sign-in page; (4) later, enable Option B and port the templates to React Email. Step 3's route and UI are reused unchanged by Option B, and leaving the SMTP settings in place gives an instant rollback when the hook is disabled.
- Options A and B are not exclusive in configuration: SMTP settings stay saved while the hook is on and take effect again when it is turned off.
- If the team is comfortable going straight to Option B, the only added work over A is the handler and templates; the domain, DNS, URL configuration and confirm route are identical.

### Gaps
- Effort estimates are judgement, not sourced.
- The whole plan depends on the domain purchase; until then the realistic interim is the built-in mailer (2 emails/hour, pre-authorised recipients only) or Google OAuth as the primary sign-in path.
- Supabase and Resend plan prices beyond the figures cited were not researched.
- No independent deliverability benchmarks for Resend to Indian mailbox providers were found or searched for.

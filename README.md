# Botly

An embeddable AI support assistant, one per client business, installed with one script tag. Multi-tenant: Next.js (App Router) + Supabase (Postgres, Auth, RLS) + Claude (Haiku 4.5 by default).

**Status: Phases 1, 2 and 3 built.** See [PLAN.md](PLAN.md) for the architecture and every place this build departs from the spec, and [Status](#status) at the bottom.

---

## 1. Run it locally

You need Node 20+ and a Supabase project (a free hosted project is easiest; the Supabase CLI with Docker also works).

```bash
npm install
cp .env.example .env.local        # fill in the values, see comments in the file
```

**Database.** Apply the migrations in order, then (optionally) the demo seed:

- Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`
- or paste `supabase/migrations/0001_schema.sql` … `0005_phase3.sql` into the SQL editor, in order (already ran 0001–0003? just run 0004 and 0005)
- demo client: run `supabase/seed.sql` the same way. It creates **Ananya Handlooms** with approved knowledge, public key `pk_ananya_demo_0001` and test token `tt_ananya_demo_private_0001_change_me_in_production`. Rotate that test link in Settings if you keep the demo in production.

**Auth.** In Supabase → Authentication → URL configuration, set Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` (and later your production URL + `/auth/callback`) to Redirect URLs. Supabase's built-in email sender only allows a few emails per hour; for real use, point Supabase Auth at Resend's SMTP (Authentication → SMTP settings).

```bash
npm run check                      # setup doctor: tests .env.local, Supabase, migrations, RLS, Anthropic, Resend
npm run dev                        # builds public/widget.js, then starts Next.js on :3000
```

If something is missing, `npm run check` says exactly what and where to get it, and the dashboard shows a **Finish setting up** page instead of crashing. After editing `.env.local`, always stop and restart `npm run dev`. `GET /api/health` returns 200 when config, database and AI are all working (use it for uptime monitoring).

Open http://localhost:3000, sign in with an address listed in `ADMIN_EMAILS`. The first sign-in makes you the platform admin.

## 2. Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel (framework: Next.js; the default `npm run build` also builds the widget).
2. Add every variable from `.env.example` in Project → Settings → Environment Variables. Set `NEXT_PUBLIC_APP_URL` to your production URL (e.g. `https://app.botly.in`).
3. Add `https://YOUR_DOMAIN/auth/callback` to Supabase Auth redirect URLs.
4. Deploy. The widget is served from `https://YOUR_DOMAIN/widget.js`.

Notes: notifications run with `after()` so they never slow the chat stream. Onboarding (crawl + drafting) can take 1–3 minutes; its route asks for 300 s. If your Vercel plan caps functions lower, reduce `CRAWL_MAX_PAGES`.

## 3. Migrations

| File | What it does |
|---|---|
| `0001_schema.sql` | All tables (§3 of the spec) plus `rate_limits`, `notifications` (delivery log), `eval_runs` (go-live gate). RLS enabled everywhere. |
| `0002_functions.sql` | Atomic rate limiter, quota-checked `begin_conversation`, usage/cost accounting, 80% warning claim, unanswered-question merging (trigram similarity). Callable only by the service role. |
| `0003_rls.sql` | `admin` sees everything; `owner` reads their own org (and may change a lead's status); `anon` sees nothing. |
| `0004_phase2.sql` | Client invites, owner answer suggestions (a trigger limits owners to suggesting), token/cost columns hidden from owners, `knowledge_chunks` with pgvector + full-text for retrieval mode, `bot_report()` for monthly reports, `delete_visitor_data()` and `purge_expired_data()`. Enables the `vector` extension. |
| `0005_phase3.sql` | `bot_integrations` for Shopify/WooCommerce order lookup. Credentials are encrypted in the app; browser roles can't read even the ciphertext. |
| `seed.sql` | Generated from `evals/ananya-handlooms.yaml` by `npm run seed:gen`. Don't edit by hand. |

Add new migrations as `0004_…sql` and so on.

## 4. Onboard a new client (about 15 minutes)

1. **Clients → New client.** Business name, type (used in the assistant's intro), plan, monthly conversations, timezone, the assistant's display name and their website. The website's domain is added to the allowed domains automatically.
2. **Onboarding.** Paste the website URL and press Start. Botly reads `robots.txt`, then `sitemap.xml` (or follows links), up to 40 pages, and pulls the product catalogue from `/products.json` on Shopify stores. Claude then drafts 20–40 FAQs, a policy summary and a tone-of-voice line. Everything lands as **draft**.
3. **Knowledge.** Filter to Drafts, read through, untick anything wrong, **Approve**. Fix gaps by editing a source or adding one (FAQ, policy, product, note). Import a product CSV (`name, price, sizes, stock note, url`) or upload PDF/DOCX price lists. Click **Use this tone** if the suggested tone fits. Only approved knowledge reaches the assistant, and edits apply to the next message.
4. **Settings.** Colour, avatar, greeting, suggested questions, business hours, lead emails and WhatsApp numbers, fallback contact (shown when chat is unavailable), privacy link. Add `http://localhost:3000` to allowed domains if you want to test the script tag on your machine.
5. **Playground.** Ask what customers ask. Use the English / Tamil / Hindi / Hinglish buttons. Click a reply to see tokens, cost, latency, tool calls and which knowledge was in the prompt.
6. **Private test link.** Overview → Copy test link, and send it to the client ("ask it anything"). It works while the bot is still a draft and isn't indexed.
7. **Eval, then go live.** `npm run eval -- --bot <bot-id>`. Every prompt-injection case must pass before **Go live** is allowed. For a client's own in-knowledge cases, copy `evals/ananya-handlooms.yaml` to `evals/<bot-id>.yaml` and change the questions; otherwise `evals/generic.yaml` is used.
8. **Install.** Send the client the one-line snippet (below). Check Conversations and Leads after the first day.

### Give the client their own login
Bot → Overview → **Client access** → enter their email → **Give access**. They get an email with the sign-in link (or send them `/login`). They see only their business: Conversations, Leads, Unanswered (they can suggest answers, which you approve with one click), Reports and the install snippet. No cost, model settings or other clients.

### Growth plan: order lookup and callbacks
1. Settings → **Plan** → Growth.
2. Settings → **Order lookup** → Shopify (store URL + Admin API token from a custom app with `read_orders`, plus `read_all_orders` for orders older than 60 days) or WooCommerce (site URL + a **Read** REST API key/secret). Botly tests the connection before saving and stores the credentials encrypted (`ENCRYPTION_KEY`).
3. Visitors can then ask "where is my order #1042?". The assistant asks for the phone or email used on the order and shows status, courier, tracking link and expected date only if they match. Wrong details get the same "couldn't find it" answer as a wrong number, and each visitor gets 5 lookups per 10 minutes.
4. "Can someone call me tomorrow evening?" opens a booking form (date + slot). It's saved as a `callback` lead and the owner is notified.
5. Growth clients get a summary email every Monday at 09:00 IST.

## Selling it as self-serve SaaS

Anyone can now sign up at your site, build an assistant from their public profiles, try it free, and pay monthly.

**Roles**
- **Super admin** (you): every address in `ADMIN_EMAILS`. Sees `/app/admin`: MRR, active trials, trial→paid conversion, AI cost and estimated margin, and can extend a trial, set a plan for offline/done-for-you clients, or suspend an account. Also sees cost, model and eval details on every bot.
- **Owner** (a customer): signs up with Google or email, or is invited by you. Manages only their own business: knowledge, settings, preview, conversations, leads, unanswered questions, reports and billing. Never sees model, cost, quotas or other customers.

**Customer journey**
1. Landing page `/` → **Start free** → `/login` (Google or email link).
2. First sign-in goes to `/start`: business name and type, website, social profile links and pasted bios, contact details and hours.
3. Botly reads up to 15 public pages (plus Shopify products), Claude writes a **business profile document**, FAQs and a policy summary (all approved automatically for self-serve), picks a greeting, suggested questions and tone, then runs the 4 prompt-injection safety checks. If they pass, the bot goes live.
4. The customer lands on their Overview: trial meter, live preview, their business profile (edit/download), the install snippet and a Go live / Pause switch.
5. Free trial: `TRIAL_DAYS` days and `TRIAL_REPLIES` AI replies (preview replies count), once per email. When it ends, visitors see the business's phone/WhatsApp/email instead of AI replies, and the owner sees "Choose a plan".
6. `/app/billing` → Razorpay Checkout (UPI, cards, net banking) → subscription active → plan quota applies. Renewals, failures and cancellations arrive by webhook.

**Why social profiles aren't scraped:** Instagram, Facebook, LinkedIn and Google Maps forbid automated reading of their pages, and Google's Places API terms don't allow storing its data. Customers paste their bios instead; the links are kept in their profile.

**Setup for payments and sign-in**
1. Run `supabase/migrations/0006_saas.sql` in the Supabase SQL Editor.
2. **Google sign-in:** Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web). Authorised redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`. Paste the client ID and secret in Supabase → Authentication → Sign In / Providers → Google, and enable it. Other providers (Microsoft, GitHub, Facebook, LinkedIn) work the same way; list them in `NEXT_PUBLIC_AUTH_PROVIDERS`.
3. **Razorpay:** complete KYC, then Dashboard → Subscriptions → Plans: create "Botly Starter" (monthly, ₹2,999) and "Botly Growth" (monthly, ₹9,999). Put the plan ids, API keys and a webhook secret in the environment (see `.env.example`). Webhooks → add `https://YOUR_DOMAIN/api/billing/webhook` with events `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`. Test with Razorpay test keys first.
4. Fill `BUSINESS_LEGAL_NAME`, `SUPPORT_EMAIL`, `GRIEVANCE_OFFICER` for the Terms and Privacy Policy pages (templates: have a lawyer review them).

## 5. Install the widget

The whole install is one line. Put it just before `</body>`:

```html
<script src="https://YOUR_DOMAIN/widget.js" data-key="BOT_PUBLIC_KEY" async></script>
```

The client's domain must be in the bot's **allowed domains** (Settings). On any other domain the widget stays silent: no bubble and no console errors.

**Shopify.** Online Store → Themes → ⋯ → Edit code → `layout/theme.liquid`. Paste the line just above `</body>` and save. Add both the store domain and `your-store.myshopify.com` (or `*.myshopify.com`) to allowed domains.

**WordPress.** Easiest: install the free "WPCode" (Insert Headers and Footers) plugin → Code Snippets → Header & Footer → paste into **Footer** → Save. Or, in a child theme, paste it before `</body>` in `footer.php`.

**Wix.** Settings → Custom code (under Advanced; needs a paid plan with a connected domain) → Add custom code → paste → Place code in **Body – end** → Apply to **All pages** → Load code **once**. Add both your custom domain and `*.wixsite.com` if you use the free subdomain for testing.

**Any other site.** Paste before `</body>` in the shared layout/footer template.

Power users can drive it from the page:

```js
Botly.open(); Botly.close();
Botly.sendMessage("Do you ship to Dubai?");
Botly.identify({ name: "Priya", phone: "9876543210", email: "priya@example.com" }); // prefills the lead form
```

To switch a client off (cancellation), untick **Active** in Settings: the bubble disappears from their site on the next page load. Nothing to remove on their side.

## 6. Tests

```bash
npm test                 # unit tests (Vitest): prompt builder, knowledge cap, quota, rate limiter, origin
                         # check, markdown sanitiser, phone validation, chat engine, crawler, CSV, eval checks
npm run widget:size      # builds the widget and prints raw/gzipped size (fails over 35 KB gzipped)
npm run eval -- --fixture evals/ananya-handlooms.yaml   # 34 eval cases against real Claude, no database needed
npm run eval -- --bot <bot-id>                          # same, against a bot in Supabase; records the result
```

The eval needs `ANTHROPIC_API_KEY`. `--scripted` runs the harness with a fake model to check the plumbing; its scores mean nothing.

**Database and end-to-end tests without Supabase.** A local test harness runs the real app against plain Postgres + PostgREST, with a minimal auth stand-in that writes magic links to a file and a fake Resend that records emails. It is for automated tests only; use the Supabase CLI for day-to-day local development.

```bash
DB=botly_test bash scripts/local-db.sh                         # migrations + seed into local Postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/botly_test npm run test:db   # RLS + SQL function tests
# End-to-end (needs a PostgREST binary and a build made with the harness env; see scripts/local-stack/start.sh):
POSTGREST_BIN=/path/to/postgrest bash scripts/local-stack/e2e.sh
```

Playwright embeds the widget on hostile pages served from a different origin: aggressive global CSS (`* { all: unset }`, `button { background: red !important }`), a sticky header with a huge z-index, a plain page, a disallowed origin, and a 375 px phone. It also signs in to the dashboard and walks through knowledge, settings, playground, conversations, leads and an onboarding crawl.

**Measured in this build:** widget 10.4 KB gzipped (budget 35 KB). Lighthouse performance on a plain host page: 100 without the widget, 100 with it (3 runs each, CLS 0).

## Scheduled jobs

`vercel.json` schedules two Vercel Cron jobs; set `CRON_SECRET` so only Vercel can call them:
- `/api/cron/retention` nightly at 03:00 IST: deletes conversations and leads older than each client's retention setting (default 12 months).
- `/api/cron/weekly` Mondays at 09:00 IST: weekly summary email for Growth clients.

## 7. Credentials you need to create

| What | Where | Used for |
|---|---|---|
| Supabase project | supabase.com | Database, auth. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Anthropic API key | console.anthropic.com | Chat replies, onboarding drafts, evals. `ANTHROPIC_API_KEY` |
| Resend API key + verified domain | resend.com | Lead emails. Until a domain is verified you can only send to your own Resend address. `RESEND_API_KEY`, `EMAIL_FROM` |
| WhatsApp Cloud API (Phase 2) | developers.facebook.com → WhatsApp | A permanent System User token, phone number ID, and an **approved utility template** named `new_lead` with 4 body variables, e.g. *"New lead for {{1}}: {{2}}, {{3}}. Need: {{4}}"*. Until then each lead logs "WhatsApp pending" and email still goes out. |
| `CRON_SECRET` | any long random string | Protects the scheduled jobs |
| `ENCRYPTION_KEY` (Growth) | `openssl rand -base64 32` | Encrypts store credentials. Never change it after connecting stores. |
| Voyage AI key (optional) | voyageai.com | Semantic search when a client's knowledge exceeds 25k tokens. Without it, retrieval uses keyword search. |
| Shopify custom app / WooCommerce API key (Growth, per client) | the client's store admin | Order lookup |
| Vercel project + domain | vercel.com | Hosting the app and `widget.js` |

## Status

**Phase 1:** migrations + RLS; clients and bots; knowledge editor with approve flow, CSV/PDF/DOCX import; website crawler with Claude-drafted FAQ/policy/tone; the widget; streaming `/api/chat` with prompt caching and the four core tools; email notifications; private test page; playground; conversations; leads; usage and cost logging; quotas; eval runner and the Ananya Handlooms eval set; go-live gate.

**Phase 2:** unanswered inbox with one-step answering and owner suggestions; client (owner) logins and views, with cost hidden at the database level; WhatsApp Cloud API notifications (active once `WHATSAPP_*` is set); monthly reports with printable view and CSV; retrieval mode for large knowledge bases (pinned policies + hybrid vector/keyword search, English rewrite for Tamil/Hindi questions); conversation export; visitor data deletion; nightly retention clean-up; 80% quota warning.

**Phase 3:** Shopify and WooCommerce order lookup with customer verification and encrypted per-bot credentials; callback/appointment booking with a date/slot card; weekly report email.

**Needs your accounts to run for real:** Anthropic (replies, evals), Resend (emails), WhatsApp Cloud API (template approval), Voyage (optional), a client's Shopify/WooCommerce store. Everything else is tested end to end on a local harness.

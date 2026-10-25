# Botly

**An AI support assistant for Indian small businesses.** Botly learns a business from its website and the profile details the owner gives it, answers visitors in English, Tamil, Hindi, Hinglish and Tanglish, and emails the owner each lead with one-tap WhatsApp and Call buttons. You install it with one `<script>` tag.

- Live site: **https://botly.in**
- Pricing: **Starter ₹2,999/month**, **Growth ₹9,999/month** (GST extra). New sign-ups get a 14-day free trial with 50 AI replies.
- Stack: Next.js 16 (App Router) and React 19 on Vercel, Supabase (Postgres, Auth, RLS, pgvector) on the free tier, Groq as the production LLM, Resend for email, Razorpay Subscriptions for billing.

| Live site, desktop (1440 px) | Live site, phone (390 px) |
|---|---|
| ![botly.in at 1440 px](docs/images/live-desktop-1440.png) | ![botly.in at 390 px](docs/images/live-mobile-390.png) |

**Guides:** [User guide for business owners](docs/USER-GUIDE.md) · [Admin demo guide](docs/ADMIN-DEMO-GUIDE.md) · [Contributing](CONTRIBUTING.md) · [Roadmap](ROADMAP.md) · [Build plan and spec departures](PLAN.md)

---

## Contents

1. [Features](#features)
2. [Screenshots](#screenshots)
3. [Architecture](#architecture)
4. [Local setup](#local-setup)
5. [Environment variables](#environment-variables)
6. [Database migrations](#database-migrations)
7. [Deploy](#deploy)
8. [Testing and evals](#testing-and-evals)
9. [Embed the widget](#embed-the-widget)
10. [Repository layout](#repository-layout)

---

## Features

Each item below is in the code on `main`. Partial features are marked as partial.

**For visitors (the widget)**
- A chat bubble from one script tag (`public/widget.js`, built from `widget/src`, about 13 KB gzipped). It runs in a shadow root, so the host site's CSS can't break it, and it stays hidden on domains that aren't allowed.
- Streams replies (Server-Sent Events), renders safe markdown, offers follow-up chips, and restores the last 24 hours of the chat.
- Replies in the language and script the visitor used: English, Tamil, Hindi, Hinglish or Tanglish. The system prompt sets this rule (`lib/prompts/assistant.ts`, rule 3) and `lib/language.ts` labels each message for reports. How well the reply matches depends on the model. See [Roadmap](ROADMAP.md) for the native-speaker Hindi check.
- Answers only from the business's **approved** knowledge. If it doesn't know, it says so, logs the question as unanswered and offers a person.
- "Talk to a person" and lead capture: a name and Indian or international phone number (validated), plus an optional email and need. The model can also open this form itself (`capture_lead`, `handoff_to_human`).
- When the trial or monthly quota runs out, the plan lapses or the AI fails, the widget shows the business's phone, WhatsApp and email instead of AI replies.
- **Growth plan:** order-status lookup for Shopify and WooCommerce, checked against the phone or email on the order (5 lookups per 10 minutes per visitor). Also callback booking with a date and time-slot card.

**For business owners (dashboard at `/app`)**
- Self-serve sign-up (`/login` with an email magic link or the OAuth providers listed in `NEXT_PUBLIC_AUTH_PROVIDERS`), then `/start`: business details, website, social profile links, pasted bios, contact details and hours.
- Onboarding reads up to 15 public pages on the trial (40 on Starter, 100 on Growth, capped by `CRAWL_MAX_PAGES`), following `robots.txt` and `sitemap.xml`, plus `/products.json` on Shopify stores. The LLM then drafts FAQs, a policy summary, a tone of voice and a one-page business profile.
- **Instagram, Facebook, LinkedIn and Google profiles are not scraped.** Their terms forbid it, so the owner pastes the bio or About text and Botly stores the links (`app/start/start-form.tsx`).
- Prompt-injection safety checks run before a bot goes live. Self-serve bots go live on their own when the checks pass.
- Knowledge editor: drafts, approved and archived sources; FAQ, policy, product, page, file and note types; product CSV import; PDF, DOCX, TXT and MD upload.
- Preview (the real widget in an iframe), Conversations (filters, CSV and JSON export), Leads (status pipeline, WhatsApp link, CSV), an Unanswered inbox, a monthly report (printable, CSV) and Settings (branding, greeting, chips, hours, allowed domains, lead emails and WhatsApp numbers, fallback contact).
- Plan and billing: Razorpay Checkout (UPI, cards, net banking), GSTIN and billing name for invoices, and cancellation.
- Emails through Resend: a lead or handoff email with **WhatsApp {name}**, **Call** and **Read the chat** buttons, an 80% quota warning, trial lifecycle emails, and a Monday summary for Growth.
- Optional WhatsApp Cloud API alerts to the owner (partial: needs an approved Meta template; until then each lead is logged as "WhatsApp pending" and email still goes out).

**For the platform owner (super admin, `ADMIN_EMAILS`)**
- `/app/admin`: MRR, active trials, trial-to-paid conversion, AI cost and estimated margin, plus extend trial, set plan and suspend actions. Latest Razorpay billing events.
- `/app/admin/demos`: private pitch demos on a copy of a prospect's homepage. See the [Admin demo guide](docs/ADMIN-DEMO-GUIDE.md).
- Done-for-you clients: create an organization and bot, review the drafted knowledge, invite the client by email, and see cost, model and eval details on every bot.

## Screenshots

These are from a local run on the seeded demo business (Ananya Handlooms, fake data) with the scripted test model. They contain no real customer data, and email addresses on the dashboard pages are replaced with "[email hidden]".

| Widget on a site (desktop) | Widget on a phone | Lead form |
|---|---|---|
| ![Widget answering on a demo store](docs/images/widget-desktop.png) | ![Widget full-screen on a 390 px phone](docs/images/widget-mobile.png) | ![Talk to a person form](docs/images/widget-lead-form.png) |

| Owner overview | Lead email with WhatsApp and Call buttons |
|---|---|
| ![Owner overview with preview, profile, install code and go-live](docs/images/owner-overview.png) | ![Lead email](docs/images/lead-email.png) |

| Knowledge | Conversations | Leads |
|---|---|---|
| ![Knowledge editor](docs/images/dashboard-knowledge.png) | ![Conversations list](docs/images/dashboard-conversations.png) | ![Leads list](docs/images/dashboard-leads.png) |

More screenshots: [admin bot overview](docs/images/dashboard-overview.png), [monthly report](docs/images/dashboard-reports.png), [plan and billing](docs/images/owner-billing.png), [sign-up form](docs/images/signup-start.png), [super admin](docs/images/admin-overview.png), [demos](docs/images/admin-demos.png).

## Architecture

```mermaid
flowchart LR
  subgraph Client["Business website"]
    V["Visitor browser<br/>widget.js (shadow DOM)"]
  end
  O["Owner / super admin browser<br/>/app dashboard, /start, /login"]

  subgraph Vercel["Next.js 16 on Vercel"]
    W["Public widget API<br/>/api/widget/config<br/>/api/chat (SSE)<br/>/api/widget/lead, /history"]
    D["Dashboard pages and<br/>Server Actions"]
    ON["Onboarding<br/>crawler + LLM drafts<br/>/api/admin/onboard"]
    E["Chat engine lib/chat<br/>origin check, rate limit,<br/>trial/quota gate, tools"]
    B["/api/billing/verify<br/>/api/billing/webhook"]
    C["/api/cron/retention (daily)<br/>/api/cron/weekly (Mon)"]
    H["/api/health"]
    DM["/demo/[slug]<br/>demo pages"]
  end

  subgraph Supa["Supabase (free tier)"]
    PG[("Postgres + RLS<br/>knowledge_sources,<br/>conversations, leads,<br/>usage, billing_events")]
    VEC[("knowledge_chunks<br/>pgvector + full-text<br/>(retrieval mode)")]
    AU["Supabase Auth<br/>magic link / OAuth"]
  end

  LLM["LLM provider<br/>Groq in production<br/>(OpenAI-compatible);<br/>Anthropic is the code default"]
  VO["Voyage AI embeddings<br/>(optional)"]
  RS["Resend<br/>lead, trial, alert emails"]
  WA["WhatsApp Cloud API<br/>(optional)"]
  RZ["Razorpay<br/>Checkout + Subscriptions"]
  ST["Shopify / WooCommerce<br/>order lookup (Growth)"]
  SITE["Public websites<br/>robots, sitemap, Shopify products.json"]

  V -->|"script src=/widget.js data-key"| W
  W --> E
  E -->|"service role, after key + origin check"| PG
  E -->|"over the knowledge cap"| VEC
  E <-->|"streaming + tool calls"| LLM
  E -.->|"lookup_order"| ST
  E -.->|"after(): notify"| RS
  E -.->|"after(): notify"| WA
  VEC -.-> VO
  O --> D
  D -->|"RLS-scoped session"| PG
  D --> AU
  O -->|"Checkout"| RZ
  RZ -->|"payment signature"| B
  RZ -->|"subscription.* webhook"| B
  B --> PG
  ON --> SITE
  ON --> LLM
  ON --> PG
  C --> PG
  C --> RS
  DM --> PG
  H --> PG
```

How a reply happens (`app/api/chat/route.ts` → `lib/chat/engine.ts`):

1. The widget posts the message with the bot's public key. The engine checks the bot is active and the request `Origin` is in `bots.allowed_origins` (or a valid private test token is present), then applies the per-visitor and per-bot rate limits (Postgres RPC).
2. Plan gate: an expired trial, used-up trial replies, a suspended account or an exhausted monthly quota returns the fallback contact card, not an AI reply.
3. The prompt is the static rules plus `<knowledge>` (approved sources only, up to `KNOWLEDGE_TOKEN_CAP`), then the time, business hours and page. On Groq the cap is about 4,000 tokens. When approved knowledge is bigger than the cap, **retrieval mode** pins policies and picks chunks with hybrid search: pgvector with Voyage embeddings when `VOYAGE_API_KEY` is set, otherwise Postgres full-text. Tamil, Hindi and mixed-language questions are rewritten into English for the search.
4. The LLM streams the answer and can call tools: `capture_lead`, `handoff_to_human`, `report_unanswered`, `suggest_followups`, and on Growth `lookup_order` and `request_callback`.
5. Usage, cost and the conversation are logged. Lead and handoff notifications go out in `after()`, so they never slow the stream.

The dashboard reads through the user's RLS-scoped Supabase session. Owners see only their own organization and never see cost or model fields. Writes go through Server Actions that check access (`lib/bot-access.ts`) and whitelist fields.

## Local setup

You need Node 20 or newer (these docs were checked with Node 20.19) and npm.

```bash
git clone https://github.com/vijayaprathap1/botly.git
cd botly
npm ci
cp .env.example .env.local     # fill in values; see "Environment variables"
```

There are two ways to get a database.

### A. A Supabase project (day-to-day development)

Use a free hosted Supabase project, or the Supabase CLI (`supabase start`, which needs Docker).

1. Apply `supabase/migrations/0001_schema.sql` through `0010_demos_upgrade.sql` **in order**, either with `supabase db push` on a linked project or by pasting each file into the SQL editor. See [Database migrations](#database-migrations).
2. Optional demo data: run `supabase/seed.sql`. It creates the fake business **Ananya Handlooms** (public key `pk_ananya_demo_0001`) with approved knowledge. `seed.sql` is generated from `evals/ananya-handlooms.yaml` by `npm run seed:gen`, so don't edit it by hand.
3. In Supabase → Authentication → URL configuration, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to the redirect URLs.
4. Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS` and an LLM key in `.env.local`.

```bash
npm run check    # setup doctor: env, Supabase, migrations, RLS, LLM, Resend, Razorpay
npm run dev      # builds public/widget.js, runs a quick check, starts Next.js on :3000
```

Sign in at http://localhost:3000/login with an address listed in `ADMIN_EMAILS`. Your first sign-in makes you the platform admin. `npm run llm:check` tests streaming, tool calling and a Tamil reply against the configured LLM.

### B. Local harness without Supabase (`scripts/local-db.sh` + `scripts/local-stack`)

This runs the real app against plain Postgres, PostgREST and a small auth stand-in that **writes magic links to a file** instead of emailing them. It is built for tests and screenshots. No external accounts are needed when you pair it with the scripted test model.

Requirements: a local Postgres 15+ with the `vector` and `pg_trgm` extensions, `psql`, and a [PostgREST](https://github.com/PostgREST/postgrest/releases) binary.

```bash
# 1. Fresh database: Supabase shim + every migration + seed (default DB name botly_test)
DB=botly_test bash scripts/local-db.sh          # or: npm run db:reset:local
#    It runs psql as `sudo -u postgres` by default; override with PSQL="psql -U postgres -v ON_ERROR_STOP=1 -q"

# 2. PostgREST (:54330) + auth gateway (:54321); writes .env.local-stack with the three Supabase vars
POSTGREST_BIN=/path/to/postgrest bash scripts/local-stack/start.sh

# 3. .env.local for the harness: copy the three lines from .env.local-stack, then add
#      NEXT_PUBLIC_APP_URL=http://localhost:3000
#      ADMIN_EMAILS=admin@botly.test
#      BOTLY_TEST_SCRIPTED_LLM=1          # scripted model, no API key; refused on Vercel
#    Optional fake email capture: node tests/e2e/fake-resend.mjs (port 54340), then set
#      RESEND_API_URL=http://localhost:54340 and a dummy RESEND_API_KEY that starts with re_

# 4. Build and start
npm run build && npx next start -p 3000
```

Open http://localhost:3000/login, enter `admin@botly.test`, and open the link that appears in `/tmp/botly-magic-links.log`. For the widget, serve any page from `http://localhost:4173` (an allowed origin in the seed) with:

```html
<script src="http://localhost:3000/widget.js" data-key="pk_ananya_demo_0001" async></script>
```

`scripts/local-stack/e2e.sh` does all of the above and then runs Playwright (see [Testing and evals](#testing-and-evals)). The ports in `start.sh` are fixed. If something else already uses 54321 (for example a running Supabase CLI stack), start PostgREST and `node scripts/local-stack/gateway.mjs` yourself with `GATEWAY_PORT`, `POSTGREST_URL`, `DATABASE_URL`, `JWT_SECRET` and `MAGIC_LINK_LOG`. The screenshots in this README were made that way.

## Environment variables

These are names only. **Never commit values.** `.env.local`, `.env` and `.env.local-stack` are gitignored. Comments in [`.env.example`](.env.example) explain where each value comes from. Production values live in Vercel → Project → Settings → Environment Variables.

**App and access**

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Public base URL with no trailing slash. Used in emails, the install snippet and test links. |
| `ADMIN_EMAILS` | Comma-separated emails that become platform super admins on first sign-in. |
| `NEXT_PUBLIC_AUTH_PROVIDERS` | OAuth buttons on `/login` (`google`, `azure`, `github`, `facebook`, `linkedin_oidc`, `apple`). Defaults to `google` when unset. Each must be enabled in Supabase. |
| `CRON_SECRET` | Shared secret that Vercel Cron sends. Without it the scheduled jobs refuse to run. |
| `ENCRYPTION_KEY` | 32-byte key that encrypts Shopify and WooCommerce credentials. Never rotate it after stores are connected. |

**Supabase**

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser (anon or publishable) key. RLS protects the data. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key, used by public widget endpoints after the key and origin checks. Never expose it. |

**LLM**

| Name | Purpose |
|---|---|
| `LLM_PROVIDER` | `anthropic` (code default) or an OpenAI-compatible preset: `groq` (production), `gemini`, `cerebras`, `mistral`, `github`, `openrouter`, `nvidia`, `openai`. |
| `LLM_API_KEY` | Key for an OpenAI-compatible provider. The code also accepts `GROQ_API_KEY`, `GEMINI_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`, `GITHUB_TOKEN`, `OPENROUTER_API_KEY` or `NVIDIA_API_KEY` as fallbacks. |
| `LLM_BASE_URL` | Overrides the preset's API base URL. |
| `LLM_MODEL` | Overrides the preset's model (Groq preset: `openai/gpt-oss-120b`). |
| `LLM_FALLBACK_MODELS` | Models to try, in order, when the main one is overloaded (Groq preset: `openai/gpt-oss-20b`). |
| `LLM_REASONING_EFFORT` | `off`, `low` or `medium` for thinking models. |
| `LLM_TIMEOUT_MS` | How long a reply may take before the contact card is shown (default 25000). |
| `LLM_REQUEST_TOKEN_LIMIT` | Largest single request for small free tiers (Groq preset: 7500). It also sizes the knowledge cap. |
| `LLM_PRICING_JSON` | Per-model USD prices for cost accounting. |
| `ANTHROPIC_API_KEY` | Key when `LLM_PROVIDER=anthropic`. |
| `ANTHROPIC_DEFAULT_MODEL` | Default Claude model for new bots. |
| `ONBOARDING_MODEL` | Model for onboarding drafts. A Claude id maps to the configured provider's model. |
| `VOYAGE_API_KEY` | Optional multilingual embeddings for retrieval mode. Without it, retrieval uses keyword search. |
| `VOYAGE_MODEL` | Overrides the Voyage model (code only, not in `.env.example`). |

**Email and WhatsApp**

| Name | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend key for lead, invite, trial, report and alert emails. Without it, leads are saved but nobody is emailed. |
| `EMAIL_FROM` | Sender, for example `Botly <...>` on a domain verified in Resend. |
| `ALERT_EMAIL` | Who receives error alerts (defaults to the first `ADMIN_EMAILS` address). |
| `WHATSAPP_ACCESS_TOKEN` | Meta System User token for WhatsApp Cloud API owner alerts (optional). |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp sender phone number ID. |
| `WHATSAPP_TEMPLATE_NAME` | Approved utility template with 4 body variables (default `new_lead`). |
| `WHATSAPP_TEMPLATE_LANG` | Template language (default `en`). |

**Billing (Razorpay) and plans**

| Name | Purpose |
|---|---|
| `RAZORPAY_KEY_ID` | Razorpay API key id (test or live). |
| `RAZORPAY_KEY_SECRET` | Razorpay API secret. Also verifies Checkout signatures. |
| `RAZORPAY_PLAN_STARTER` | `plan_…` id of the monthly Starter plan. |
| `RAZORPAY_PLAN_GROWTH` | `plan_…` id of the monthly Growth plan. |
| `RAZORPAY_WEBHOOK_SECRET` | Secret for `/api/billing/webhook` (`subscription.*` events). |
| `PRICE_STARTER_INR` | Starter price shown on the site (default 2999). Must match the Razorpay plan. |
| `PRICE_GROWTH_INR` | Growth price shown on the site (default 9999). Must match the Razorpay plan. |
| `TRIAL_DAYS` | Free-trial length (default 14). |
| `TRIAL_REPLIES` | AI replies in the trial (default 50). Preview replies count. |
| `TRIAL_CRAWL_PAGES` | Pages read during trial onboarding (default 15). |
| `USD_INR` | Exchange rate for the super-admin margin estimate. |

**Limits**

| Name | Purpose |
|---|---|
| `KNOWLEDGE_TOKEN_CAP` | Most approved knowledge per prompt before retrieval mode (default 25000, lower on small free tiers). |
| `RATE_LIMIT_VISITOR_PER_10MIN` | Messages per visitor per 10 minutes (default 20). |
| `RATE_LIMIT_BOT_PER_MIN` | Messages per bot per minute (default 120). |
| `DEFAULT_QUOTA_STARTER` | Monthly conversations on Starter (default 2000). |
| `DEFAULT_QUOTA_GROWTH` | Monthly conversations on Growth (default 10000). |
| `CRAWL_MAX_PAGES` | Upper bound on pages read by the crawler (default 40). |
| `SHOPIFY_API_VERSION` | Shopify Admin API version for order lookup. |

**Public business details (legal pages, footer, contact)**

| Name | Purpose |
|---|---|
| `BUSINESS_LEGAL_NAME` | Legal name on Terms, Privacy and Refund pages (defaults to "Botly"). |
| `BUSINESS_CITY` | City shown on legal pages. |
| `BUSINESS_ADDRESS` | Registered address (Razorpay's website review asks for it). |
| `SUPPORT_EMAIL` | Public support mailbox (code default `support@botly.in`). |
| `SUPPORT_PHONE` | Public phone and WhatsApp (code has a default). |
| `GRIEVANCE_OFFICER` | Grievance officer named on the Privacy Policy. |
| `NEXT_PUBLIC_DEMO_BOT_KEY` | Optional bot key for a live demo chat on the landing page. |

**Demo builder**

| Name | Purpose |
|---|---|
| `DEMO_CONTACT_PHONE` | Phone a prospect sees when a demo runs out (falls back to `SUPPORT_PHONE`). |
| `DEMO_CONTACT_WHATSAPP` | WhatsApp a prospect sees when a demo runs out. |
| `DEMO_CONTACT_EMAIL` | Email a prospect sees (falls back to `SUPPORT_EMAIL`, then the first admin). |
| `DEMO_REPLY_LIMIT` | AI replies per demo (default 150). |
| `DEMO_DEFAULT_DAYS` | Default demo lifetime in days (default 14). |
| `DEMO_RENDER` | `auto` opens JavaScript-built sites in headless Chromium; `off` makes plain copies only. |
| `DEMO_CHROME_PATH` | Local development only: path to Chrome for rendering. |

**Tests and local harness only (never set in production)**

| Name | Purpose |
|---|---|
| `BOTLY_TEST_SCRIPTED_LLM` | `1` switches to a scripted model for tests. The app refuses it on Vercel. |
| `RESEND_API_URL`, `RAZORPAY_API_URL`, `VOYAGE_API_URL`, `WHATSAPP_API_URL` | Point the API clients at local fakes. |
| `DATABASE_URL` | Postgres URL for `npm run test:db` and the harness gateway. |
| `JWT_SECRET`, `GATEWAY_PORT`, `POSTGREST_URL`, `MAGIC_LINK_LOG` | Local auth gateway settings (`scripts/local-stack`). |

`VERCEL`, `AWS_LAMBDA_FUNCTION_NAME` and `NEXT_RUNTIME` are read but set by the platform.

## Database migrations

Apply these once each, in filename order (`supabase/migrations/`). `scripts/local-db.sh` applies them all to a fresh local database.

| # | File | What it adds |
|---|---|---|
| 1 | `0001_schema.sql` | All core tables (organizations, bots, knowledge, conversations, messages, leads, usage, notifications, `eval_runs`, `rate_limits`) with RLS enabled everywhere. |
| 2 | `0002_functions.sql` | Atomic rate limiter, quota-checked conversation start, usage and cost accounting, unanswered-question merging. Service role only. |
| 3 | `0003_rls.sql` | Policies: admin sees everything, owners see their own organization, anon sees nothing. |
| 4 | `0004_phase2.sql` | Client invites, owner answer suggestions, cost columns hidden from owners, `knowledge_chunks` (pgvector + full-text), `bot_report()`, visitor data deletion, retention purge. |
| 5 | `0005_phase3.sql` | `bot_integrations` for Shopify and WooCommerce order lookup (credentials encrypted in the app). |
| 6 | `0006_saas.sql` | Self-serve: trial, plans, Razorpay subscription fields, `billing_events`, business profile. |
| 7 | `0007_billing_details.sql` | Billing name, GSTIN and the trial email log. |
| 8 | `0008_hours_not_set.sql` | Business hours default to "not set" instead of a made-up Mon–Sat schedule. |
| 9 | `0009_demos.sql` | Demo builder: `demo_sites` and the `is_demo` organization flag. |
| 10 | `0010_demos_upgrade.sql` | Brings an early draft of the demo tables in line with the code. Safe to re-run. |

**Pending in open pull requests (not on `main` yet):**

| File | PR | Notes |
|---|---|---|
| `0011_launch_guards.sql` | [#1](https://github.com/vijayaprathap1/botly/pull/1) | Counts a trial reply only after it succeeds, adds a shared AI budget across bots, dedupes alerts. |
| `0012_analytics.sql` | [#3](https://github.com/vijayaprathap1/botly/pull/3) | Growth analytics (a `metrics` schema the Data API can't read). Apply after 0011 when both exist; it also applies on 0001–0010 alone. |
| `0013_demo_guards.sql` | [#5](https://github.com/vijayaprathap1/botly/pull/5) | Demo slice of the AI budget and a flagged-draft count. **Requires 0011.** |

Order once merged: 0011 → 0012 → 0013. New migrations take the next free number.

## Deploy

Botly is hosted on **Vercel**. **Production deploys come from `main`**: merging a pull request into `main` ships it to https://botly.in. Pull requests get Vercel preview deployments.

- Build command: the default `npm run build`, which also builds `public/widget.js`. The widget is served from `https://botly.in/widget.js`. Use the bare domain, because `www` redirects and the redirect breaks CORS.
- Environment variables: set them in Vercel for Production (and Preview if you test payments there). See [Environment variables](#environment-variables).
- Supabase Auth: add `https://YOUR_DOMAIN/auth/callback` to the redirect URLs. For sign-in emails at volume, point Supabase Auth's SMTP at Resend.
- Razorpay: create the monthly plans and a webhook to `https://YOUR_DOMAIN/api/billing/webhook` with `subscription.*` events. `npm run check` checks that the keys, plans and prices match.
- Cron (`vercel.json`): `/api/cron/retention` runs daily at 03:30 UTC (09:00 IST). It runs the retention purge, trial lifecycle emails and the demo expiry sweep. `/api/cron/weekly` runs Mondays at 03:30 UTC (09:00 IST) and sends the Growth weekly summary.
- Long-running routes ask for up to 300 seconds (onboarding, go-live checks, demos). On a plan with lower limits, reduce `CRAWL_MAX_PAGES`.
- Monitoring: `GET /api/health` returns 200 when config, database and AI config are fine. `?deep=1` also makes a real LLM call, so don't poll it often on a free LLM tier.
- Migrations are not run by the deploy. Apply new files in the Supabase SQL editor before or with the merge that needs them.

## Testing and evals

```bash
npm run typecheck        # tsc --noEmit
npm test                 # unit tests (Vitest, tests/unit): prompt, language detection, quota, rate limits,
                         # origin check, crawler, CSV, billing, orders, notifiers, demo snapshot, ...
npm run widget:size      # builds the widget and prints raw/gzipped size against the 35 KB budget
```

On `main` at the time of writing, `npm test` passes 212 tests in 27 files.

**Database tests** (RLS and SQL functions) run against a local Postgres made by `scripts/local-db.sh`:

```bash
DB=botly_test bash scripts/local-db.sh
DATABASE_URL=postgres://postgres:postgres@localhost:5432/botly_test npm run test:db
```

**End-to-end** (Playwright, `tests/e2e`): the widget on hostile host pages (global CSS resets, a huge z-index sticky header, a disallowed origin, a 375 px phone), the lead form and handoff, the dashboard flow (knowledge, settings, playground, conversations, leads, onboarding crawl) and self-serve sign-up. They need the local harness:

```bash
npm run build                                          # with the harness .env.local (see Local setup B)
POSTGREST_BIN=/path/to/postgrest bash scripts/local-stack/e2e.sh
# or against a running app with the seed loaded:
E2E_APP_URL=http://localhost:3000 npm run test:e2e
```

If Playwright's bundled browser isn't installed, set `PW_CHROMIUM_PATH=/usr/bin/google-chrome`.

**Evals** (`scripts/eval.ts`, cases in `evals/*.yaml`):

```bash
npm run eval -- --fixture evals/ananya-handlooms.yaml   # no database; uses the active LLM key
npm run eval -- --bot <bot-id>                          # a real bot; records eval_runs (gates "Go live")
npm run eval -- --scripted --fixture evals/ananya-handlooms.yaml   # harness self-test, scores meaningless
```

Every prompt-injection case must pass before a bot can go live. `evals/generic.yaml` is used when there's no `evals/<bot-id>.yaml`.

**Language eval:** `npm run eval:languages` (a live check of English, Hindi, Hinglish, Tamil and Tanglish replies on an in-memory fixture) is **not on `main` yet**. It arrives with [PR #4](https://github.com/vijayaprathap1/botly/pull/4). Until that merges, use `npm run llm:check`, which includes a Tamil reply, and the Tamil, Hindi and Hinglish buttons in the Playground.

## Embed the widget

The install code is one line, taken from the bot's **Overview → Install on your website** card (`installSnippet()` in `lib/dashboard.ts`):

```html
<script src="https://botly.in/widget.js" data-key="YOUR_BOT_PUBLIC_KEY" async></script>
```

Put it just before `</body>`. The site's domain must be listed in **Settings → Allowed domains**. On any other domain the widget stays silent: no bubble and no console errors. The bot also has to be live and active.

**Plain HTML.** Paste the line before `</body>` on every page, or in the shared footer or layout template.

**Shopify.** Online Store → Themes → ⋯ → Edit code → `layout/theme.liquid`. Paste the line just above `</body>` and save. Add the store domain and `your-store.myshopify.com` (or `*.myshopify.com`) to the allowed domains.

**WordPress.** Install the free WPCode plugin (Insert Headers and Footers) → Code Snippets → Header & Footer → paste into **Footer** → Save. Or, in a child theme, paste the line before `</body>` in `footer.php`.

**Wix.** Settings → Custom code (under Advanced; needs a paid plan with a connected domain) → Add custom code → paste → place the code in **Body – end** → apply to **All pages** → load the code **once**. Add your domain, and `*.wixsite.com` if you test on the free subdomain.

**JavaScript API** (optional, from `widget/src/index.ts`). Calls made before the widget loads are queued:

```js
Botly.open();
Botly.close();
Botly.sendMessage("Do you ship to Dubai?");
Botly.identify({ name: "Priya", phone: "9876543210", email: "priya@example.com" }); // prefills the lead form
```

The widget only reads `data-key`. `data-mode="fullscreen"` and `data-test-token` are used by the private test page `/t/<token>`; don't put them on a public site. To switch a bot off, untick **Active** in Settings (super admin) or **Pause** it from the Overview. The bubble disappears on the next page load, and the snippet can stay on the site.

## Repository layout

```
app/                 Next.js routes: marketing pages, /login, /start, /app dashboard, /app/admin,
                     /t/[testToken] test page, /demo/[slug], and /api/* (chat, widget, billing, cron, health)
components/          UI: dashboard shell, home page sections, marketing
lib/                 chat engine and tools, LLM providers, prompts, crawler, onboarding, retrieval,
                     notify (Resend, WhatsApp), billing (Razorpay), orders (Shopify/WooCommerce), demo builder
widget/src/          framework-free TypeScript widget → esbuild → public/widget.js
supabase/            migrations, seed.sql, auth email templates
scripts/             build-widget, check, eval, llm-check, gen-seed, local-db.sh, local-stack/
tests/               unit (Vitest), db (Vitest + Postgres), e2e (Playwright) with fixtures
evals/               eval cases (YAML)
docs/                guides and screenshots
```

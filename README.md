# Botly

**An AI support assistant for Indian small businesses, installed with one line of code.** Botly reads a business's website, drafts its FAQs and policies, then answers visitors 24/7 in English, Tamil, Hindi, English . It only answers from approved knowledge and hands leads to the owner by email and WhatsApp.

**Live:** [botly-rosy.vercel.app](https://botly-rosy.vercel.app/)

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

### Free LLM for testing

Botly can run on a free OpenAI-compatible API instead of Claude while you test. Put two lines in
`.env.local` (and in Vercel → Settings → Environment Variables, then redeploy):

| Provider | `LLM_PROVIDER=` | Get the key | Free tier (check current limits) |
|---|---|---|---|
| **Google Gemini** (recommended) | `gemini` | https://aistudio.google.com/apikey | Best Tamil/Hindi, large token allowance, no card. Free tier may train on data |
| Cerebras (fastest) | `cerebras` | https://cloud.cerebras.ai | Trial credit (30 days), ~1M tokens/day, 5 req/min |
| Mistral | `mistral` | https://console.mistral.ai/api-keys | "Experiment" plan, generous monthly tokens, needs phone verification, may train on data |
| Groq | `groq` | https://console.groq.com/keys | Very fast, ~1,000 req/day but ~8k tokens/min: small knowledge bases only |
| GitHub Models | `github` | https://github.com/settings/personal-access-tokens (fine-grained, "Models: read") | ~150 req/day, ~8k input tokens per request |
| OpenRouter | `openrouter` + `LLM_MODEL=<id>:free` | https://openrouter.ai/keys | ~50 req/day (1,000 after a $10 top-up) |
| NVIDIA | `nvidia` | https://build.nvidia.com | Shared queue; big models (Llama 3.3 70B) often time out |

Put the key in `LLM_API_KEY`. NVIDIA models that respond quickly (try in this order): `qwen/qwen3-next-80b-a3b-instruct` (default),
`openai/gpt-oss-120b` (add `LLM_REASONING_EFFORT=low`), `openai/gpt-oss-20b`, `nvidia/nemotron-3.5-lightning-30b-a3b`.
Avoid 70B+ dense models and "thinking" variants on the free queue.

Optional: `LLM_MODEL` to pick another model (confirm the exact id in the provider's console),
`LLM_REASONING_EFFORT=off|low|medium` for thinking models (Gemini and Groq presets use `low`),
`LLM_TIMEOUT_MS` (default 25000) before a slow reply gives up and shows the contact card.

Then run `npm run llm:check`. It tests streaming, tool calling ("I don't know" reporting) and a Tamil reply, with timings.

What changes with a free tier:
- Replies stream the same way, and every tool works (leads, handoff, unanswered, follow-ups). Cost shows $0.
- No Claude prompt caching, and free tiers are rate-limited, so replies can be slower than Claude's ~2 seconds.
- Other models may follow the grounding and language rules less reliably, and the go-live safety check may fail more often.
- Free tiers are for testing. Gemini's free tier may use prompts to improve Google's products, so don't send real customer
  conversations through it. Switch back with `LLM_PROVIDER=anthropic` (or a paid key) before you sell.

## 2. Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel (framework: Next.js; the default `npm run build` also builds the widget).
2. Add every variable from `.env.example` in Project → Settings → Environment Variables. Set `NEXT_PUBLIC_APP_URL` to your production URL (e.g. `https://app.botly.in`).
3. Add `https://YOUR_DOMAIN/auth/callback` to Supabase Auth redirect URLs.
4. Deploy. The widget is served from `https://YOUR_DOMAIN/widget.js`.

Notes: notifications run with `after()` so they never slow the chat stream. Onboarding (crawl + drafting) can take 1–3 minutes; its route asks for 300 s. If your Vercel plan caps functions lower, reduce `CRAWL_MAX_PAGES`.
## How it works

1. **Onboard from a URL.** Botly crawls the site (respecting `robots.txt` and sitemaps, with Shopify-aware extraction). Claude drafts FAQs, policies and a tone guide, with progress streamed live to the dashboard.
2. **Review the knowledge.** The owner edits, approves or archives each entry, or imports CSV, PDF and DOCX files. Only approved knowledge reaches the bot.
3. **Test before going live.** A private playground shows tokens, latency, cost and tool calls for every reply. A bot can only go live after it passes its eval suite, including the prompt-injection cases.
4. **Install.** One script tag on any site (Shopify, WordPress, Wix, Webflow or plain HTML):

   ```html
   <script src="https://YOUR_APP_URL/widget.js" data-key="BOT_PUBLIC_KEY" async></script>
   ```

## Features

- **Multilingual replies.** The bot answers in the visitor's language and script. A server-side detector labels Tamil and Devanagari scripts, plus English and Tanglish written in English letters, for reports and evals.
- **Tool-using assistant.** Capture a lead, hand off to a human, request a callback, look up an order, flag unanswered questions and suggest follow-ups.
- **Order lookup.** Connects to Shopify (Admin GraphQL) and WooCommerce (REST). The customer is verified by email or phone first, and only status, carrier, tracking link and ETA are shared.
- **Leads and notifications.** A lead pipeline with CSV export. Owners are notified by email (Resend) and WhatsApp Cloud API, with retries and a delivery log.
- **Unanswered-questions inbox.** Near-duplicate questions are merged, and answering one turns it into approved knowledge in a single step.
- **Owner dashboard.** Conversations, transcripts, leads, business hours, branding, allowed domains, quotas and weekly reports.
- **Self-serve SaaS.** OAuth sign-in, a 14-day trial, and Razorpay subscriptions in INR with webhook-driven plan changes.

## Engineering highlights

- **Streaming chat.** Replies stream over Server-Sent Events. The widget sends JSON as `text/plain` to skip the CORS preflight, saving a round trip on every message.
- **Prompt caching by design.** The system prompt is split into a cached block (rules and knowledge) and a small dynamic block (time, page, visitor). Changing context then doesn't break Anthropic's prefix cache.
- **Scales past the context window.** Small knowledge bases go into the prompt whole. Above a 25k-token cap, Botly switches to hybrid retrieval: pgvector embeddings (Voyage, multilingual) plus Postgres full-text and trigram search, merged with reciprocal-rank fusion. Policies are always pinned in the prompt.
- **Tenant isolation in the database.** Supabase Postgres has row-level security on every table and no anonymous policies. Cost and token columns are hidden from owner roles at the grant level, not just in the UI.
- **Security.** Public endpoints check the bot's key and allowed origin. Rate limits are applied per visitor and per bot. Store credentials are encrypted with AES-256-GCM, and Razorpay webhooks are HMAC-verified.
- **Privacy operations.** Nightly data retention runs on Vercel Cron, and a single call can delete all of one visitor's data.
- **Framework-free widget.** Written in TypeScript and bundled with esbuild into a small `widget.js`, with no framework dependencies on the customer's site.
- **Eval harness.** YAML test cases (grounding, language, prompt injection) run against the real prompt, with results recorded per bot.

## Tech stack

| Layer | Tools |
|---|---|
| App | Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4 |
| AI | Anthropic Claude (Haiku 4.5 by default, set per bot), tool use, prompt caching |
| Data | Supabase (Postgres, Auth, RLS), pgvector, Voyage embeddings |
| Integrations | Shopify, WooCommerce, Razorpay, Resend, WhatsApp Cloud API |
| Validation | Zod |
| Testing | Vitest (unit and DB/RLS), Playwright (e2e), custom LLM eval runner |
| Hosting | Vercel (including Cron) |

## Project structure

```
app/            Next.js routes: marketing, dashboard (/app), public widget API, billing, cron
lib/chat/       Chat engine: prompt build, tool loop, streaming, history
lib/retrieval/  Chunking, embeddings, hybrid retriever, index sync
lib/crawler/    robots.txt, sitemap, extraction, Shopify
lib/orders/     Shopify and WooCommerce order providers
lib/notify/     Email and WhatsApp notifiers with retry dispatch
widget/src/     Embeddable widget (framework-free TS, built with esbuild)
supabase/       SQL migrations (schema, functions, RLS) and demo seed
evals/          LLM eval suites
tests/          unit / db / e2e
```

## Running locally

Requires Node.js 20+, and either a Supabase project or a local Postgres.

```bash
git clone https://github.com/vijayaprathap1/botly.git
cd botly
npm install
cp .env.example .env.local      # every variable is documented inline

npm run db:reset:local          # local Postgres: Supabase shim + migrations + demo seed
npm run dev                     # builds the widget, checks env, starts Next.js
```

Other scripts:

```bash
npm test            # unit tests
npm run test:db     # database and RLS tests
npm run test:e2e    # Playwright end-to-end tests
npm run eval        # run the LLM eval suites
npm run typecheck
```

## Author

**Vijayaprathap P**, Senior Full-Stack Engineer
[LinkedIn](https://linkedin.com/in/vjprathap) · [GitHub](https://github.com/vijayaprathap1) · [Email](mailto:pvijayaprathap1@gmail.com)

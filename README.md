# Botly

**An AI support assistant for Indian small businesses, installed with one line of code.** Botly reads a business's website, drafts its FAQs and policies, then answers visitors 24/7 in English, Tamil, Hindi, English . It only answers from approved knowledge and hands leads to the owner by email and WhatsApp.

**Live:** [botly-rosy.vercel.app](https://botly-rosy.vercel.app/)

---

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

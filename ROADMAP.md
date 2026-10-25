# Roadmap

This is where Botly stands as of **25 Oct 2026**. It's based on the code on `main`, the open pull requests and the launch-readiness review. "Shipped" means it's on `main` today. Everything else isn't, however close it is.

Legend: **[decision]** needs Vijayaprathap's call (usually money, legal or brand) · **[ops]** a dashboard or settings task, no code · **[code]** needs a pull request.

## In review (open pull requests)

Merge order matters: #1 → #3 → #4 → #5. #4 is stacked on #1, and #5 on #4 and #1. Apply each migration before or with its merge.

| PR | What it does | Migration |
|---|---|---|
| [#1](https://github.com/vijayaprathap1/botly/pull/1) Harden chat for Groq limits | Unknown or retired model ids fall back to the default model instead of failing. Adds a shared AI budget across all bots and a per-conversation reply cap. Visitors get the lead form and contact card when the AI is unavailable. Trial replies are counted only after a successful answer. `?deep=1` health checks need the cron secret or an admin session. Adds an FAQ exact-match shortcut with no LLM call. | `0011_launch_guards.sql` |
| [#3](https://github.com/vijayaprathap1/botly/pull/3) Growth analytics | Cookieless Cloudflare Web Analytics, server-side funnel events (sign-up → build → embed → live → lead → paid), first-touch UTM, the first widget origin per bot, and `metrics` views for a daily export. | `0012_analytics.sql` |
| [#4](https://github.com/vijayaprathap1/botly/pull/4) Launch QA fixes | Hindi and Tanglish retrieval (separate English rewrite plus rank fusion), a mandatory reply-language line, strict per-item grounding, refusing made-up coupons, port-less `localhost` origins, a message queue while a reply streams, and a plain-text lead email fix. Adds `npm run eval:languages`. | none |
| [#5](https://github.com/vijayaprathap1/botly/pull/5) Harden demo links | Demo disclaimer in replies, a per-conversation demo cap, a demo slice of the AI budget, and test-token rotation on Expire now and Delete. +14 days also resets the demo's reply count. | `0013_demo_guards.sql` |

## Before launch

- [ ] **AI capacity** **[decision]**. Production uses Groq (`openai/gpt-oss-120b`, falling back to `openai/gpt-oss-20b`). Free-tier per-minute and per-day token limits allow only a small number of replies a day across all customers, and a single bot build uses a large share of them. Options: a paid Groq tier, a second provider as a fallback, or both. PR #1 makes running out graceful but doesn't add capacity.
- [ ] **Model ids** **[code]**. Each bot stores `bots.model`, and `resolveModel()` on `main` only remaps Claude ids. A retired id returns a 404 with no fallback. Fixed by PR #1. Until it merges, keep every bot on the configured model.
- [ ] **Sign-in email** **[ops]**. Point Supabase Auth's custom SMTP at Resend and raise the auth email rate limit. Resend's free tier is shared by magic links, lead emails, alerts and trial emails.
- [ ] **Razorpay live** **[ops]**. Website approval for botly.in, live keys, live Starter and Growth plans, and the live webhook to `https://botly.in/api/billing/webhook`. Run a ₹1 live test, then refund it.
- [ ] **Legal name and address** **[decision][ops]**. Set `BUSINESS_LEGAL_NAME` and `BUSINESS_ADDRESS`, and `GRIEVANCE_OFFICER` for the Privacy Policy. The legal pages fall back to "Botly" and a city only, and Razorpay's review asks for these.
- [ ] **support@botly.in mailbox** **[ops]**. `support@botly.in` is the code default for `SUPPORT_EMAIL` and is printed on the site, legal pages and emails. Make sure the mailbox exists and someone reads it.
- [ ] **Vercel plan** **[decision]**. The Hobby plan's terms are for non-commercial use. Decide on Pro before taking payments.
- [ ] **Database backups** **[ops]**. The Supabase free tier has no backups or point-in-time recovery. Add a scheduled `pg_dump` to private, encrypted storage.

## Quality and trust

- [ ] **Hindi native-speaker check** **[ops]**. Have a native speaker review Hindi and Hinglish replies on a real bot. PR #4 adds `npm run eval:languages` for automated checks; a human pass is still needed for tone and naturalness.
- [ ] **Tanglish shown consistently** **[code]**. Tanglish is detected (`lib/language.ts`) and prompted for, but the Starter plan card lists "English, Tamil, Hindi, Hinglish", and the Playground has quick buttons only for English, Tamil, Hindi and Hinglish.
- [ ] **Retrieval without embeddings** **[decision]**. Knowledge above the token cap (about 4,000 tokens on Groq) uses retrieval mode. Without `VOYAGE_API_KEY` it's keyword-only, which is weaker for Tamil and Hindi questions (PR #4 improves it). Decide whether to pay for embeddings.
- [ ] **CI** **[code]**. There's no GitHub Actions workflow. Run typecheck, unit tests and the widget size budget on every pull request.

## Brand

- [ ] **Favicon and Open Graph image** **[code]**. `app/icon.svg` and `app/opengraph-image.tsx` still use the old indigo mark (`#4f46e5`). Update them to the current homepage look.

## Paused

- **xAI as the LLM provider** **[decision]**. The switch is paused. There's no xAI preset in `lib/llm/provider.ts` today. xAI's API is OpenAI-compatible, so it would be an env-only change (`LLM_PROVIDER=openai`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`) plus an eval run (`npm run eval -- --bot <id>`) before switching production.

## Product gaps (honest list)

These are claims or ideas the product doesn't fully meet yet:

- **Instagram and Google profiles** are not read automatically. The owner pastes bios and links in `/start`, and only the website is crawled. Reading them would need an official API (Instagram Graph API, Google Business Profile API) and the owner's authorization.
- **WhatsApp alerts to owners** need a WhatsApp Cloud API sender and an approved template. Until then, leads show "WhatsApp pending" and owners rely on email. (The WhatsApp button inside the lead email is a plain wa.me link and always works.)
- **Weekly summary email** is Growth only. Starter owners see reports in the dashboard.
- **Analytics** (sign-up funnel, first widget install): none on `main`; arriving with PR #3.

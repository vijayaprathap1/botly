# Botly — build plan

Phase 1 (sellable MVP) is what this repo builds now. Phase 2 and 3 items are listed at the end with where they plug in.

## Folder structure

```
app/
  layout.tsx, page.tsx, globals.css
  login/                      magic-link sign-in
  auth/callback/route.ts      Supabase code exchange + admin bootstrap (ADMIN_EMAILS)
  auth/signout/route.ts
  app/                        dashboard (/app)
    page.tsx                  clients & bots (metrics per bot)
    orgs/new/                 create org + first bot
    bots/[botId]/
      page.tsx                overview (install snippet, test link, usage, cost)
      onboarding/             URL → crawl → Claude drafts (streamed progress)
      knowledge/              editor: filter/search/edit/approve/archive/CSV/PDF/DOCX
      playground/             chat + debug panel (tokens, latency, cost, tool calls)
      settings/               branding, greeting, chips, hours, domains, notify, quota, active, live
      conversations/          list + filters + transcript
      leads/                  table, status pipeline, WhatsApp link, CSV
  t/[testToken]/page.tsx      private full-screen test page (noindex)
  api/
    chat/route.ts             POST, Server-Sent Events
    widget/config/route.ts    GET, public config for the embed
    widget/history/route.ts   GET, last-24h restore
    widget/lead/route.ts      POST, lead form / "Talk to a person"
    admin/onboard/route.ts    POST, NDJSON progress stream (admin only)
    admin/export/route.ts     GET, CSV export of leads (admin only)
lib/
  env.ts, config.ts           env access + pricing/limits config
  supabase/                   server (RLS, cookie session), admin (service role), browser
  prompts/assistant.ts        §7 template + builder
  prompts/onboarding.ts       FAQ/policy/tone drafting prompt
  chat/engine.ts              the chat turn: prompt, tool loop, streaming, logging
  chat/tools.ts               tool schemas + executors
  chat/store.ts               ChatStore interface; supabase-store.ts and memory-store.ts
  chat/history.ts             last 12 turns + short note for older turns
  llm/                        LlmClient interface; anthropic.ts; scripted.ts (tests only)
  knowledge.ts                approved-knowledge block builder with 25k-token cap
  notify/                     Notifier interface; resend.ts; whatsapp.ts; dispatch.ts (retry+log)
  security/origin.ts          allowed-origin matching
  security/rate-limit.ts      RateLimiter interface; Postgres + in-memory implementations
  quota.ts, cost.ts, language.ts, tokens.ts, hours.ts, ids.ts
  validation/                 zod schemas; phone.ts (shared with widget)
  crawler/                    robots, sitemap, fetch, extract, shopify
widget/src/                   framework-free TS → esbuild → public/widget.js
  index.ts, api.ts, ui.ts, styles.ts, markdown.ts, storage.ts, color.ts, sse.ts
supabase/migrations/          0001 schema, 0002 functions, 0003 RLS
supabase/seed.sql             Ananya Handlooms demo org/bot/knowledge
evals/ananya-handlooms.yaml   eval set (34 cases)
scripts/                      build-widget.mjs, eval.ts, local-db.sh
tests/unit, tests/db, tests/e2e
```

## Migrations

1. `0001_schema.sql` — all §3 tables plus: `rate_limits`, `notifications` (per-channel delivery log), `eval_runs` (gates going live). Enums as check constraints. Indexes on every foreign key and hot lookup (`bots.public_key`, `bots.test_token`, `conversations(bot_id, last_message_at)`).
2. `0002_functions.sql` — `rate_limit_hit()` (atomic fixed window), `record_usage()` (upsert into `usage_monthly`), `touch_conversation()`, `merge_unanswered()` (near-duplicate merge by trigram similarity), `updated_at` trigger.
3. `0003_rls.sql` — `is_admin()`, `user_org_ids()` (security definer); RLS on every table; admin sees all, owner sees own org; no anon policies at all.
4. `seed.sql` — Ananya Handlooms.

## API

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/widget/config?key=` | public key + Origin | branding, greeting, chips, hours, open/closed, quota state. Returns `{enabled:false}` (not an error) when inactive or origin not allowed. |
| `POST /api/chat` | public key + Origin (or test token) | SSE: `meta`, `delta`, `tool_card`, `suggestions`, `debug` (playground only), `done`, `error` |
| `GET /api/widget/history` | key + visitorId + conversationId | last 24h of messages for restore |
| `POST /api/widget/lead` | key + Origin | lead form submit and "Talk to a person" |
| `POST /api/admin/onboard` | admin session | crawl + draft, streams NDJSON progress |
| `GET /api/admin/export` | admin session | leads/conversations CSV/JSON |

Dashboard mutations are Server Actions validated with zod and executed with the user's RLS-scoped Supabase client.

## Departures from the spec, and why

1. **System prompt order (prompt caching).** Anthropic caches by prefix. The §7 template puts the current time and page URL *before* the knowledge, which changes every message and would make the knowledge block uncacheable. The builder emits two system blocks: (a) identity + rules + `<knowledge>` with `cache_control`, then (b) a small dynamic block with time, hours, open/closed, page and known visitor details. Wording of every rule is unchanged.
2. **Prompt caching minimum.** Haiku 4.5 only caches prompts of at least 4,096 tokens. Small knowledge bases (like the Ananya demo, ~2k tokens) are below that, so no cache hits happen for them; cost is still tiny. Larger bots cache automatically.
3. **Older history is summarised extractively**, not by an extra LLM call: turns older than the last 12 become one short system note listing the earlier visitor questions and the facts already collected. This keeps latency and cost flat. An LLM summary can replace it later behind the same function.
4. **Extra SSE event `meta`** (sends `conversationId` first) and **`debug`** (admin playground only). The five spec events are unchanged.
5. **Widget posts JSON as `text/plain`** so the browser skips the CORS preflight on every message (saves one round trip, helps P4). The server still parses and zod-validates it.
6. **"Talk to a person" opens the lead form directly** in the widget instead of asking the model first — faster, no tokens, same result (lead saved, conversation `handed_off`, owner notified). The model can still trigger the same form through `handoff_to_human`.
7. **`handoff_to_human` accepts optional name/phone/email.** If the visitor already gave them in chat the handoff completes in one step; otherwise the tool returns the lead form card.
8. **Terminal tools don't cost an extra model call.** If the model has already written its answer and only called `suggest_followups`/`report_unanswered`, the turn ends without a second API round trip.
9. **Admin role bootstrap.** `memberships.org_id` is nullable for `admin` rows (you are admin of the platform, not one org). The first sign-in by an email in `ADMIN_EMAILS` creates the admin membership.
10. **Going live is gated** on the latest eval run for that bot having all prompt-injection cases passing (`eval_runs`), per §8. The private test link always works.
11. **Quota at 100%** blocks *new* conversations; a conversation already in progress may finish (it was already counted). The widget shows the fallback contact card.
12. **Token counts for the knowledge cap** are estimated locally (chars/4 for Latin, chars/2 for Indic scripts) so edits are instant; exact usage is logged from the API response for every message.
13. **Language detection** runs on the server (script + Hinglish/Tanglish word lists) for logging, reports and eval checks. The model itself chooses the reply language per rule 3.
14. **WhatsApp**: the Cloud API sender is written but only activates when `WHATSAPP_*` env vars exist; until then each lead records a `pending_credentials` WhatsApp notification and email still goes out. (WhatsApp is Phase 2 in the spec; wiring it now costs nothing.)
15. **Notifications** are dispatched with `after()` so they never block the stream; 3 attempts with backoff, each attempt logged in `notifications`.

## Phase 2 / 3 hooks already in place

- `unanswered_questions` are recorded and merged now; the inbox UI is Phase 2.
- RLS for the `owner` role is live now; owner screens are Phase 2.
- `knowledge_chunks` + pgvector: not created yet (full-context mode only). Retrieval plugs into `lib/knowledge.ts`.
- Growth tools (`lookup_order`, `request_callback`) are not registered; `lib/chat/tools.ts` registers tools by plan.

## Phase 2 and 3: how they're built

- **Owners.** `org_invites` → membership on first sign-in (`accept_invites` in the auth callback). Owner screens reuse the dashboard with admin-only tabs hidden and admin-only pages redirecting. Cost is protected in the database, not just the UI: `usage_monthly` has no owner policy and the token/cost columns of `messages` are not granted to the `authenticated` role (admin screens read them with the service role after checking the admin session).
- **Unanswered inbox.** "Answer" inserts an approved FAQ source and marks the question answered in one step. Owners can only write `suggested_answer` (RLS + a trigger that rejects any other column change by a non-admin).
- **Retrieval mode** switches on automatically when approved knowledge exceeds `KNOWLEDGE_TOKEN_CAP`. Departure: policy sources are always *pinned* into the cached prompt (they answer most questions and must never be missed), and the top 8 chunks for each question go in the per-message block. Search is hybrid: pgvector cosine on Voyage embeddings + Postgres full-text/trigram, fused with reciprocal-rank fusion. Tamil/Hindi/mixed questions are rewritten to English by a short Haiku call first (the original text is kept in the query too). Without `VOYAGE_API_KEY` it still works on keyword search. The index syncs after every knowledge change (`after()`); a chat that finds no index uses the capped full context and triggers a sync.
- **Reports** come from one SQL function (`bot_report`), which runs with the caller's RLS so owners get their own numbers. "Resolved" = not handed off, no unanswered question, at least one reply. Hours saved = resolved × the admin-set minutes per conversation.
- **Deletion and retention.** `delete_visitor_data(phone | visitor_id)` removes every conversation of every visitor id linked to that phone, their leads and notification logs. `purge_expired_data()` runs nightly via Vercel Cron.
- **Order lookup.** `OrderProvider` interface with Shopify (Admin GraphQL) and WooCommerce (REST v3, Shipment Tracking meta) implementations. Credentials are AES-256-GCM encrypted with `ENCRYPTION_KEY` and never readable by browser roles. Verification compares email case-insensitively or the last 10 phone digits against every contact on the order. Not-found and mismatch return the same answer. Lookups are rate-limited per visitor. Only status, carrier, https tracking link and expected date leave the server.
- **Callbacks** are leads of type `callback` with `preferred_time`. The model can book directly when the visitor gave everything, or it opens the date/slot form in the widget.
- **Forms keep what you typed** when a save fails: dashboard forms submit through `useFormAction` instead of React's default form reset.

# Social messaging channel integration

How Botly can answer a business's customers on WhatsApp, Instagram and Facebook Messenger with the same assistant that runs in the website widget, and the plan to build it. Research current as of 14 October 2026. Decisions taken: WhatsApp connects **directly through Meta as a Tech Provider, with a BSP as a stop-gap**, and channels ship in the order **WhatsApp → Instagram → Messenger**.

---

## 1. The short version

- **It fits Botly well.** All three channels are "customer messages first, business replies" — exactly what `runChat()` already does. The engine, knowledge, quotas, lead capture and notifications are reused; what's new is a webhook in, a sender out, and per-channel rules.
- **One Meta app covers all three.** Botly registers one Meta developer app, completes **Business Verification** once, and goes through **App Review** for the permissions of each channel. Customers then connect their own accounts in a popup (Embedded Signup for WhatsApp, Instagram Login for Instagram, Facebook Login for Messenger).
- **Policy allows it.** Meta's January 2026 WhatsApp ban targets *general-purpose* AI assistants (ChatGPT-style); businesses using AI to support **their own customers** are explicitly not affected ([TechCrunch](https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform), [Meta terms](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform)). Botly bots already answer only from the business's knowledge, which is the right side of that line.
- **Two business risks to handle up front:**
  1. **Firecracker sellers** (your first client, Shree Shanmuga Crackers) are in a category WhatsApp lists as prohibited ("weapons, ammunition, or explosives") ([Meta policy enforcement](https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement-violations)). Their WhatsApp number could be banned. Offer them Instagram/website instead, or get explicit acceptance of the risk.
  2. **WhatsApp replies now cost money.** Since 1 Oct 2026, free-form "service" replies are charged per message (≈ ₹0.115 + GST in India) ([Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages)). With Tech Provider onboarding, that bill goes to **the business's own card**, not to Botly — but it must be explained at sign-up.
- **The biggest code gap is not the API — it's human takeover.** Botly has no way for the owner to reply in a conversation today. Meta requires a clear path to a human, and on social channels customers expect the owner to jump in. This needs building alongside the first channel.

---

## 2. The three channels compared

| | WhatsApp (Cloud API) | Instagram DMs | Facebook Messenger |
|---|---|---|---|
| Value for Indian SMBs | Highest | High (D2C, salons, boutiques) | Medium, declining |
| How a business connects | Embedded Signup popup (v4): Facebook login → business portfolio → WhatsApp Business Account → verify phone → display name → **add payment card** | Instagram Login (no Facebook Page needed) + turn on *Allow access to messages* in the Instagram app | Facebook Login for Business → pick Page → Page token |
| Phone/account rule | Number must not be on the WhatsApp app, unless "coexistence" (keep using the Business app) — **India availability unclear** | Professional (Business or Creator) account | Any Page the admin manages |
| Meta permissions (Advanced Access) | `whatsapp_business_messaging`, `whatsapp_business_management` | `instagram_business_basic`, `instagram_business_manage_messages` | `pages_messaging`, `pages_manage_metadata`, `pages_show_list` |
| Reply window | 24 h after the customer's last message; after that only paid, pre-approved templates | 24 h; HUMAN_AGENT tag gives 7 days **for manual human replies only** | Same as Instagram |
| Text limit | 4,096 chars | **1,000 bytes** (≈ 330 Tamil/Hindi chars) — split replies | 2,000 chars |
| Quick-reply buttons | 3 reply buttons (20-char titles) or a list of up to 10 | Up to 13 quick replies (20 chars), not on desktop | Up to 13 |
| Cost per reply | ≈ ₹0.115 + GST, paid by the business to Meta | Free | Free |
| Token lifetime | Business-integration system-user token (long-lived) | 60 days, must be refreshed before expiry | Long-lived Page token |
| Human takeover | Botly inbox only | Conversation Routing → Instagram inbox | Conversation Routing → Page inbox (Business Suite) |

Sources: [WhatsApp Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/), [Tech Provider onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider/), [reply buttons](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages), [list messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages), [Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login), [Instagram messaging](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api), [Conversation Routing](https://developers.facebook.com/docs/messenger-platform/conversation-routing), [Messenger quick replies](https://developers.facebook.com/docs/messenger-platform/send-messages/quick-replies).

**Other channels, ranked.** Telegram is free and needs no approval (owner pastes a BotFather token) — a cheap fourth channel, but niche in India. RCS is mostly outbound marketing today and needs a CPaaS provider. SMS can't hold a conversation (DLT templates). X DMs are paid per call and low value. Google Business Messages was shut down on 31 July 2024. YouTube and LinkedIn have no DM API.

---

## 3. What Meta requires from Botly (the non-code work)

This is the critical path — start it before writing code.

1. **Meta Business Verification** for Botly's own business portfolio (company documents, website botly.in, domain verification). Required before App Review.
2. **One Meta app** with the WhatsApp, Instagram and Messenger use cases.
3. **Legal pages:** privacy policy naming Meta channels, Botly as processor and the business as data fiduciary (DPDP Act); terms; a **data-deletion callback URL** that accepts Meta's signed request and returns a status URL + confirmation code ([Meta](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback)).
4. **App Review screencasts** per permission: the admin logging in, selecting the account, a message sent from Botly, and **that message arriving in the real WhatsApp/Instagram/Messenger app** (missing that last step is a common rejection). For WhatsApp, also a template created through Botly.
5. **Tech Provider status** for WhatsApp. Onboarding limit: 10 new businesses per rolling 7 days until verified; 200 per week after Business Verification + App Review + Access Verification ([Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)).
6. **Use Embedded Signup v4.** v2/v3 are deprecated from 15 October 2026 ([Meta blog](https://developers.facebook.com/blog/post/2026/05/14/embedded-signup-v4/)).

**Timeline to expect:** Meta publishes no SLA. Access Verification is typically ~5 business days (Twilio); the whole process ranges from a few weeks to a few months, including resubmissions.

**BSP stop-gap while waiting.** Sign up with a BSP that passes the Cloud API through unchanged (360dialog does — ~€49+/number/month, no markup on Meta fees). Botly's adapter talks the same Cloud API payloads, so only the base URL and token change per connection. Move customers to direct once approved.

---

## 4. Rules the product must follow

- **Answer within 30 seconds**, every input, including button taps (Messenger/Instagram policy). Send a typing indicator immediately; keep the free-tier LLM wait inside that.
- **Disclose automation** at the start of a conversation and when handing back from a human (required in some jurisdictions, recommended everywhere).
- **Always offer a human path** (WhatsApp: "prompt, clear and direct escalation paths").
- **Never send an AI reply outside the 24-hour window.** Out-of-window messages are templates (WhatsApp) or human-only HUMAN_AGENT replies (Instagram/Messenger, 7 days).
- **Don't use WhatsApp data to train models**, including pooled across tenants. Botly doesn't train today — keep it that way for channel data.
- **Opt-in** before any business-initiated WhatsApp message (lead follow-ups, reminders).
- **Dedupe webhooks**: Meta retries for up to 7 days, batches up to 1,000 events, and doesn't guarantee order ([Meta webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview)).

---

## 5. How it fits Botly's code today

Findings from the codebase (paths as of commit `c69a898`):

| Area | Today | Change needed |
|---|---|---|
| Access | `resolveAccess()` (`lib/chat/access.ts`) checks the page **origin** — a webhook has none, so it always fails | Add a channel access path: bot `active` + `live` + channel connection `ok` |
| Bot lookup | `getBotByKey(public_key)` | Look up the connection by Meta id (`phone_number_id`, IG account id, Page id) → bot |
| Conversation resume | Widget sends `conversationId`; restored within 24 h | Store method: latest open conversation for (bot, channel, external user) |
| Visitor id | `^[A-Za-z0-9_-]{8,64}$` (`lib/validation/schemas.ts`, DB check) | `wa_919876543210`, `ig_<IGSID>`, `fb_<PSID>` fit |
| Output | `emit()` events (`meta/delta/tool_card/suggestions/done/error`) | Channel adapter collects the turn and sends once (no streaming on these channels) |
| Lead tools | `capture_lead`/`handoff_to_human` show a form card and tell the model "a form is now shown" | On channels: no form; tool result says "ask them to type their name" and **phone comes from the WhatsApp sender** (pass as `identity.phone`, already counted by `phoneWasGiven`) |
| Prompt | "shown in a chat widget on their website"; page title/URL lines | Per-channel wording; drop page lines |
| Formatting | Model writes `**bold**`, `[label](url)`, `-` lists for the widget | WhatsApp: `*bold*`, `label: url`; Instagram/Messenger: plain text, bare URLs, split at 1,000 bytes |
| Suggestion chips | `suggest_followups` → `suggestions` event (≤ 3) | WhatsApp reply buttons (truncate to 20 chars) / Instagram–Messenger quick replies |
| Credentials | `bot_integrations` only allows `shopify`/`woocommerce`, `store_url` NOT NULL, one row per bot; AES-GCM via `lib/crypto.ts` | New `channel_connections` table (below), same encryption |
| Webhook pattern | Razorpay webhook: raw body → HMAC check → idempotency row → `after()` | Same shape for Meta (`X-Hub-Signature-256`, app secret) |
| WhatsApp code | `lib/notify/whatsapp.ts` sends lead-alert templates from one platform number (env vars), never run live | Reuse the HTTP helper; keep it for owner alerts |
| Human reply | **None.** "Handed off" only adds a prompt fact; the AI keeps answering | Build takeover: pause bot per conversation + owner reply box |
| Plans | `lib/plans.ts` has a `growthTools` flag that nothing reads; gating is hard-coded `plan === "growth"` | Add `channels` to the plan definition and read it via `planDef()` |
| LLM capacity | Groq free tier, ~1 reply/minute across the platform | **Must be upgraded before launch** — channel traffic is bursty and Meta expects replies in 30 s |

---

## 6. Implementation plan

### Phase 0 — Meta paperwork (start now, runs in parallel)
Business Verification, Meta app, legal pages + data-deletion endpoint, BSP account for the first WhatsApp customers, and upgrade the LLM plan off Groq's free tier.

### Phase 1 — Shared channel foundation (≈ 1.5–2 weeks)

**Migration `0011_channels.sql`** (applied by hand in the Supabase SQL editor, like the others):
- `channel_connections`: `id, bot_id → bots, channel ('whatsapp'|'instagram'|'messenger'), external_id` (phone_number_id / IG account id / Page id, **unique per channel**), `display_name, credentials_encrypted, via ('meta'|'bsp'), status ('pending'|'ok'|'error'|'disconnected'), token_expires_at, last_error, last_checked_at, created_at`. Owners can read non-secret columns of their bots' rows (column grant like `bot_integrations`); writes via service role only.
- `conversations`: add `channel text not null default 'web'`, `external_user_id text`, `bot_paused_until timestamptz`, `last_inbound_at timestamptz` (for the 24 h window); index on `(bot_id, channel, external_user_id, last_message_at desc)`.
- `messages`: add `external_id text` with a unique index (webhook dedupe) and `author text` (`'ai'|'human'`) so owner replies show differently.
- `begin_conversation(...)`: recreate with a `p_channel` argument (drop + recreate + re-grant, as `0002` does).
- `bot_report` / usage: group by channel.

**Code:**
- `lib/channels/types.ts` — `ChannelAdapter { channel; parseWebhook(body) → InboundMessage[]; send(conn, to, OutboundReply); markSeen/typing(conn, msg) }`.
- `lib/channels/format.ts` — markdown-lite → WhatsApp / plain text, byte-aware splitting, tool-call stripping (reuse `stripTextToolCalls`).
- `lib/channels/run.ts` — `handleInbound(conn, msg)`: dedupe on `messages.external_id` → find/resume conversation → if `bot_paused_until` is in the future, store the message and notify the owner instead of replying → call `runChat()` with a collecting `emit` → translate cards/suggestions into channel messages → send → persist.
- Engine changes (`lib/chat/engine.ts`, `lib/chat/access.ts`, `lib/prompts/assistant.ts`, `lib/chat/store.ts` + `memory-store.ts` + `supabase-store.ts`): `EngineContext.channel`; channel access path; channel-aware lead/callback tool instructions; prompt wording per channel; `findOpenConversation()`; `getConnectionByExternalId()`.
- `app/api/webhooks/meta/route.ts` — one endpoint for all three: `GET` verify (`hub.challenge`), `POST` HMAC check on the raw body, `200` immediately, process in `after()` with `maxDuration`. Route by `object` (`whatsapp_business_account` / `instagram` / `page`).
- `lib/env-check.ts` — `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_CONFIG_ID` (Embedded Signup), `ENCRYPTION_KEY` (already used, not yet checked); optional, so they go in `NON_BLOCKING`.
- `lib/plans.ts` — `channels` per plan, read through `planDef()`.

**Human takeover (needed for every channel):**
- Conversation page (`app/app/bots/[botId]/conversations/[conversationId]/page.tsx`): "Take over" (pauses the bot for 24 h), a reply box that sends through the channel adapter (allowed inside the window; on Instagram/Messenger, up to 7 days with the HUMAN_AGENT tag), and "Hand back to AI".
- `handoff_to_human` on a channel pauses the bot, emails the owner with a link to the conversation, and tells the customer when to expect a reply.
- Conversations list: channel icon, filter by channel, "needs reply" for paused threads.

### Phase 2 — WhatsApp (≈ 2 weeks)
- `lib/channels/whatsapp.ts`: parse `entry[].changes[].value` (`metadata.phone_number_id`, `messages[]`, `statuses[]`); support text, button replies, list replies; images/voice notes get a polite "please type your question" reply for now. Send text (4,096 chars), reply buttons for suggestions, mark read + typing indicator together.
- Connect flow in Settings → Channels: Embedded Signup v4 popup (Facebook JS SDK) → server exchanges the code for the business token → `POST /<WABA_ID>/subscribed_apps` → save encrypted. BSP connections: owner/admin enters the BSP key; same adapter with a different base URL.
- Sign-up copy: the business adds its own card in Meta; Meta charges ≈ ₹0.115 + GST per reply.
- Lead capture: sender's number is passed as `identity.phone`; the model asks only for the name.
- Outside 24 h: AI never replies; owner replies need an approved utility template (phase 2b: template picker; start with "reply only within 24 h").
- Category check at connect time: warn firecracker/weapon/pharmacy-type businesses about WhatsApp's commerce policy.

### Phase 3 — Instagram (≈ 1–1.5 weeks)
- `lib/channels/instagram.ts`: Instagram Login OAuth (code → short token → 60-day token), `POST /<IG_ID>/subscribed_apps` for `messages,messaging_postbacks`.
- Daily cron (add to `/api/cron/retention`) refreshes tokens older than ~30 days; on failure mark the connection `error` and email the owner.
- Split replies at 1,000 bytes; quick replies for suggestions; ignore echoes of the business's own messages (but pause the bot when the owner replies from the Instagram app — that's a human takeover).
- Onboarding checklist: professional account + *Allow access to messages* toggle; a "Send test message" check.
- Later: comment-to-DM (private replies) — one reply within 7 days of a comment, 750/hour.

### Phase 4 — Messenger (≈ 1 week)
- `lib/channels/messenger.ts`: Facebook Login for Business → `/me/accounts` → Page token; subscribe the Page.
- Conversation Routing: Botly is the Page's default app; handoff calls `pass_thread_control` to the Page Inbox (app id `263902037430900`) so owners can also reply from Business Suite; `standby` events mean a human owns the thread.

### Phase 5 — Polish and pricing
- Dashboard analytics by channel; WhatsApp cost estimate per month for owners.
- Pricing (see below), Razorpay plan updates, landing page copy.
- Optional: Telegram (cheap, no approval).

---

## 7. Pricing suggestion

Indian competitors charge roughly ₹1,300–3,500/month for AI on WhatsApp on top of a ₹2,800–3,800 platform plan, plus a 10–25% markup on Meta's per-message fees (Interakt: AI agents ₹2,499/month with 100 AI messages, then ₹0.50 each; AiSensy: ₹1,350/month for 1,000 AI messages) ([Interakt](https://www.interakt.shop/pricing/), [AiSensy](https://aisensy.com/pricing)). Global tools (Tidio, Chatbase, ManyChat) include Instagram/Messenger without a channel fee.

A competitive position for Botly:
- **Starter (₹2,999):** website + Instagram + Messenger.
- **Growth (₹9,999):** adds WhatsApp; Meta's message fees paid directly by the business with **no Botly markup**.
- Count channel conversations against the same monthly conversation quota as the widget.

---

## 8. Open questions to settle

- **Coexistence in India** (keep the number on the WhatsApp Business app while Botly answers): Meta's page lists no countries and vendor reports conflict. Test with the first customer; if unavailable, businesses need a separate number.
- **The "1,000 free service messages per month"** quoted by several BSPs isn't on Meta's page — treat as unconfirmed.
- **Which Messenger message tags survive in 2026** (reports say CONFIRMED_EVENT_UPDATE / ACCOUNT_UPDATE / POST_PURCHASE_UPDATE were removed). Botly only needs HUMAN_AGENT.
- **Meta review timing** — budget 2–6 weeks per review round.

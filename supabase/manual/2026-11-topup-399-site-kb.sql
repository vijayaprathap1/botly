-- One-off, PRODUCTION ONLY (botly.in site assistant e9282c7a-…): top-up price ₹249 → ₹399 in the
-- site assistant's approved knowledge, and say that Pro's 10,000 conversations are one shared
-- total. NOT a migration: row ids exist only in production. NOT RUN YET.
-- Run only after the ₹399 release is live on botly.in (otherwise the bot would quote ₹399 while
-- Billing still charges ₹249). Each UPDATE only matches rows that still say ₹249, so running it
-- twice (or after someone edited a row by hand) changes nothing.
-- token_count = estimateTokens(content) from lib/tokens.ts for the new text.
-- Tamil/Hindi: there are no Tamil or Hindi knowledge rows quoting the price (checked 17 Nov with
-- read-only SELECTs); the assistant translates these English answers when a visitor asks in Tamil.
-- Afterwards: open Knowledge for "Botly website (botly.in)" and save any entry once, so the
-- retrieval index re-syncs (afterKnowledgeChange → syncChunks for the whole assistant).
begin;

update public.knowledge_sources set updated_at = now(), token_count = 66, title = 'Can I buy more conversations (a top-up)?', content =
'Q: Can I buy more conversations (a top-up)?
A: Yes. A top-up adds 500 conversations for ₹399, any time from Billing. They are added to your workspace''s monthly total (shared by all your assistants), are for the current calendar month only and don''t carry over.'
where id = '4a95a86d-683c-4d36-93bc-4a16fe31eee7' and (content like '%₹249%' or title = 'Can I buy more conversations?');
-- (Applied 17 Nov 2026 in production in two steps: the ₹399 text first, then this "top-up" title,
-- because English visitors asking "How much is a top-up?" got no answer without the word.)

update public.knowledge_sources set updated_at = now(), token_count = 260, content =
'Q: How much does Botly cost?
A: Botly has a Free plan and three paid plans, priced in rupees. The price you see is the price you pay.
- Free: ₹0. 50 conversations a month; English, Tamil, Hindi, Tanglish and Hinglish; leads by email. Shows "Powered by Botly".
- Starter: ₹799/month (or ₹7,990/year). 500 conversations a month; everything in Free; appointment booking with live availability; one-tap WhatsApp reply to leads; unanswered-questions inbox; monthly report.
- Growth: ₹1,999/month (or ₹19,990/year). 2,000 conversations a month; everything in Starter; order-status lookup (Shopify, WooCommerce); callback booking; weekly summary email; no Botly branding.
- Pro: ₹4,999/month (or ₹49,990/year). 10,000 conversations a month in total, shared by up to 3 assistants; everything in Growth.
Need more in a busy month? Add 500 conversations for ₹399. Founding offer: the first 25 shops get Growth at ₹999/month, locked for 12 months. Every account starts on Free with no card needed; cancel a paid plan any time.'
where id = 'e1640297-c1e6-4e4d-a462-f6b01237c4ea' and content like '%₹249%';

update public.knowledge_sources set updated_at = now(), token_count = 102, content =
'Q: What happens when I run out of conversations? Will I be charged?
A: Never without your say-so. When a plan''s monthly conversations are used up, visitors see your phone, WhatsApp and email instead of AI replies until the next month. Nothing breaks on your site. You can add 500 conversations for ₹399, or upgrade, from Billing. A trial that ends works the same way until you pick a plan or move to Free.'
where id = '0efa06fb-edd9-42c5-b947-408f4fbdd01d' and content like '%₹249%';

-- Check: should return no rows.
-- select id, title from public.knowledge_sources where bot_id = 'e9282c7a-73be-4c50-8b05-643f8be403d7' and status = 'approved' and content like '%₹249%';

-- Imported pages: /terms and /refund-policy read the price from code, so re-import them after the
-- deploy (Knowledge → the page → refresh) if they are approved sources.

commit;

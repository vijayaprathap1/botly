-- One-off, PRODUCTION ONLY (botly.in site assistant e9282c7a-…): bring its approved
-- knowledge in line with the new pricing. NOT a migration: row ids exist only in production.
-- Run after the pricing deploy is live. Each UPDATE only matches the old text, so running
-- it twice (or after someone edited a row by hand) changes nothing.
-- Afterwards: open Knowledge for "Botly website (botly.in)" and save any entry once, so the
-- retrieval index re-syncs (afterKnowledgeChange → syncChunks for the whole assistant).
begin;

update public.knowledge_sources set updated_at = now(), content =
'Q: How much does Botly cost?
A: Botly has a Free plan and three paid plans, priced in rupees. The price you see is the price you pay.
- Free: ₹0. 50 conversations a month; English, Tamil, Hindi, Tanglish and Hinglish; leads by email. Shows "Powered by Botly".
- Starter: ₹799/month (or ₹7,990/year). 500 conversations a month; everything in Free; one-tap WhatsApp reply to leads; unanswered-questions inbox; monthly report.
- Growth: ₹1,999/month (or ₹19,990/year). 2,000 conversations a month; everything in Starter; order-status lookup (Shopify, WooCommerce); callback booking; weekly summary email; no Botly branding.
- Pro: ₹4,999/month (or ₹49,990/year). 10,000 conversations a month; everything in Growth; up to 3 assistants.
Need more in a busy month? Add 500 conversations for ₹249. Founding offer: the first 25 shops get Growth at ₹999/month, locked for 12 months. Every account starts on Free with no card needed; cancel a paid plan any time.'
where id = 'e1640297-c1e6-4e4d-a462-f6b01237c4ea' and content like '%2,999%';

update public.knowledge_sources set updated_at = now(), content =
'Q: What are the pricing plans?
A: Free (₹0, 50 conversations a month), Starter (₹799/month, 500 conversations), Growth (₹1,999/month, 2,000 conversations, includes Shopify and WooCommerce order lookup) and Pro (₹4,999/month, 10,000 conversations, up to 3 assistants). Yearly costs 10 months'' price: ₹7,990, ₹19,990 and ₹49,990.'
where id = '8c0cd95c-d5f6-4f32-905a-1b45348d13de' and content like '%2,999%';

update public.knowledge_sources set updated_at = now(), title = 'Is there a free plan or trial?', content =
'Q: Is there a free plan or trial?
A: Yes. Every new account starts on the Free plan: 50 conversations a month, free for ever, no card required. If you want to try a paid plan first, ask us for a 14-day trial, or a 30-day pilot with free setup.'
where id = '694677da-c409-46d8-b6ea-07a3d439e29b' and content like '%14%day free trial%';

-- Duplicate of the row above: archive it rather than keep two answers.
update public.knowledge_sources set updated_at = now(), status = 'archived'
where id = '0b36bbcb-60fc-4fec-88e8-e4ef9233e273' and status = 'approved' and content like '%14-day free trial%';

update public.knowledge_sources set updated_at = now(), title = 'What happens when I run out of conversations? Will I be charged?', content =
'Q: What happens when I run out of conversations? Will I be charged?
A: Never without your say-so. When a plan''s monthly conversations are used up, visitors see your phone, WhatsApp and email instead of AI replies until the next month. Nothing breaks on your site. You can add 500 conversations for ₹249, or upgrade, from Billing. A trial that ends works the same way until you pick a plan or move to Free.'
where id = '0efa06fb-edd9-42c5-b947-408f4fbdd01d' and content like '%nothing is charged before you choose Starter or Growth%';

update public.knowledge_sources set updated_at = now(), content =
'Q: Can Botly handle order‑status lookups?
A: Yes, the Growth and Pro plans include order‑status lookup for Shopify and WooCommerce after the customer verifies their phone or email.'
where id = '22b122d6-512a-4064-82d3-4b3d11eb789a' and content like '%the Growth plan includes%';

update public.knowledge_sources set updated_at = now(),
  content = replace(content, 'The Growth plan adds order-status lookup for Shopify and WooCommerce.', 'The Growth and Pro plans add order-status lookup for Shopify and WooCommerce.')
where id = '94dd8208-7104-4209-b9b8-ebe831516d10' and content like '%The Growth plan adds order-status lookup%';

insert into public.knowledge_sources (bot_id, type, title, status, url, content)
select 'e9282c7a-73be-4c50-8b05-643f8be403d7', 'faq', 'What is the founding offer?', 'approved', 'https://botly.in/',
'Q: What is the founding offer?
A: The first 25 shops get the Growth plan at ₹999/month instead of ₹1,999, locked for 12 months.'
where not exists (select 1 from public.knowledge_sources where bot_id = 'e9282c7a-73be-4c50-8b05-643f8be403d7' and title = 'What is the founding offer?');

insert into public.knowledge_sources (bot_id, type, title, status, url, content)
select 'e9282c7a-73be-4c50-8b05-643f8be403d7', 'faq', 'Can I buy more conversations?', 'approved', 'https://botly.in/',
'Q: Can I buy more conversations?
A: Yes. Add 500 conversations for ₹249 any time from Billing. They are for the current calendar month and don''t carry over.'
where not exists (select 1 from public.knowledge_sources where bot_id = 'e9282c7a-73be-4c50-8b05-643f8be403d7' and title = 'Can I buy more conversations?');

-- Imported pages that quote the old terms. Re-import them after the deploy (Knowledge → the
-- page → refresh) instead of hand-editing: 79ff58ba… /refund-policy, 686527e5… /terms.
-- 24795c78… (old homepage) is already archived and not used for answers.

commit;

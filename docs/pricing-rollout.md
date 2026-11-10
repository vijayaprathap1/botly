# New pricing: rollout checklist (Nov 2026)

Nothing below has been done. Every step is a live action that needs Vijayaprathap's OK.
The order matters: **Razorpay plans → env → migration → deploy → KB → checks**.

## 1. Razorpay (live account): create 7 plans

Subscriptions → Plans → Create. All INR, "every 1" period. Amounts are what the customer pays (no tax added on top).

| Name | Period | Amount (₹) | Amount (paise) | Env var |
| --- | --- | --- | --- | --- |
| Botly Starter | monthly | 799 | 79900 | `RAZORPAY_PLAN_STARTER` (replaces the ₹2,999 id) |
| Botly Growth | monthly | 1,999 | 199900 | `RAZORPAY_PLAN_GROWTH` (replaces the ₹9,999 id) |
| Botly Pro | monthly | 4,999 | 499900 | `RAZORPAY_PLAN_PRO` (new) |
| Botly Starter Yearly | yearly | 7,990 | 799000 | `RAZORPAY_PLAN_STARTER_YEARLY` (new) |
| Botly Growth Yearly | yearly | 19,990 | 1999000 | `RAZORPAY_PLAN_GROWTH_YEARLY` (new) |
| Botly Pro Yearly | yearly | 49,990 | 4999000 | `RAZORPAY_PLAN_PRO_YEARLY` (new) |
| Botly Growth Founding | monthly | 999 | 99900 | `RAZORPAY_PLAN_GROWTH_FOUNDING` (new; leave unset to keep "Contact us") |

Top-ups (₹249 = 24900 paise) are one-time Orders: no plan needed.
Webhook (Account & Settings → Webhooks, existing `/api/billing/webhook`): **add the `order.paid` event** next to `subscription.*`, or top-ups rely only on the browser callback.

Old ₹2,999 / ₹9,999 plans: leave them in Razorpay (plans can't be deleted, and nobody is subscribed to them).

## 2. Vercel env (Production)

Set the 7 `RAZORPAY_PLAN_*` ids above. No other env is required; the prices and caps live in `lib/plans.ts`.
Do **not** set `PRICE_STARTER_INR` / `PRICE_GROWTH_INR` (they would override the new prices).

Safety net: checkout fetches the Razorpay plan and refuses it if its amount or period doesn't match the price on the page,
so an env var still pointing at the ₹2,999 plan blocks payment ("contact support") instead of overcharging.

## 3. Database: run `supabase/migrations/0015_new_pricing.sql`

Back up first (Supabase → Database → Backups, or `pg_dump` of `public.organizations`). Then run the file in the SQL editor.
It is additive (adds `free`/`pro` to the plan check, default plan `free`, top-up columns + `quota_topups`, `founding_claims`, 4 functions).
It changes no existing row. The app on `main` keeps working with it, so it must go **before** the deploy:
the new sign-up inserts `plan = 'free'`, which the old check constraint rejects.

## 4. Deploy

Merge the PR (auto-deploys production).

## 5. botly.in site assistant knowledge

Run `supabase/manual/2026-11-pricing-site-kb.sql` (production only; guarded so it's safe to re-run), then open
Knowledge for "Botly website (botly.in)" and save any entry once so the retrieval index re-syncs.
Re-import the `/terms` and `/refund-policy` pages from Knowledge after the deploy.

Rows it changes: e1640297 (How much does Botly cost?), 8c0cd95c (pricing plans), 694677da (free trial → free plan),
0b36bbcb (duplicate, archived), 0efa06fb (after the trial → out of conversations), 22b122d6 and 94dd8208 (order lookup on Growth and Pro);
adds "What is the founding offer?" and "Can I buy more conversations?".

## 6. Existing workspaces (decisions, optional SQL)

No paying subscribers: 0 billing events, no Razorpay subscription ids, and the three Botly checkouts in Razorpay (₹2,999 Starter) all failed.
Existing plans and quotas are grandfathered (the migration doesn't touch them).

- Botly (own site, `growth`, 10,000/month, 1 assistant): under the new table Growth = 2,000. Suggest Pro to keep 10,000:
  `update organizations set plan = 'pro', monthly_conversation_quota = 10000 where id = '406520ed-8598-450d-8c56-52c9391298c7';`
- Big Test Store (`starter`, 2,000/month, test data): leave as is, or `monthly_conversation_quota = 500` to match the new Starter.
- 10 workspaces on `trial` (6 self-serve): unchanged. When a trial ends, the owner sees "Move to Free" in Billing. To move all ended trials now:
  `update organizations set plan = 'free', monthly_conversation_quota = 50, subscription_status = 'none' where plan = 'trial' and not is_demo and (trial_ends_at < now() or trial_replies_used >= trial_reply_limit);`

## 7. Check after deploy

- `npm run check` with production env: every Razorpay plan "found" at the right amount.
- Homepage #pricing shows ₹0 / ₹799 / ₹1,999 / ₹4,999, founding banner, ₹249 top-up line.
- New sign-up lands on Free (50/month); Billing shows monthly/yearly buttons and the top-up button.
- One real top-up and one real subscription in live mode (₹249 and ₹799), then refund/cancel them.

## Rollback

Revert the merge commit (redeploys the old app). The migration can stay (old app ignores it). If it must go, see the
rollback block at the top of `0015_new_pricing.sql` (only valid while no workspace is on `free`/`pro`).

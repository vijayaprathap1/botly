-- Growth analytics. Additive: new table, new columns, a metrics schema the Data API
-- cannot read. Existing signup, chat, billing and widget behaviour is unchanged.
--
-- Checked against migrations 0001–0010 (the launch-readiness note had no runnable
-- SQL, only the sources below). Corrections applied here:
--   * organizations.created_at is the signup time. auth.users is not required.
--   * organizations.plan is trial | starter | growth (0006), not only paid plans.
--   * organizations.is_demo already exists (0009). is_internal did not.
--   * There is no widget-origin column. bots.first_seen_* is new. Historical
--     "bot live" uses conversations.page_url (is_test = false), not usage_monthly.
--   * usage_monthly.messages counts both sides of a turn (record_usage is called
--     with 2). AI replies are messages.role = 'assistant'.
--   * There is no plan-changed timestamp and no price column. MRR uses the
--     ex-GST monthly defaults from lib/plans.ts: Starter 2999, Growth 9999.
--   * Admin-assigned paid plans with no Razorpay event stay in current_status
--     only. Daily paid history comes from billing_events and analytics_events.

-- ─── Workspace attributes ───────────────────────────────────────────────────
alter table public.organizations
  add column if not exists is_internal boolean not null default false,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists referrer text,
  add column if not exists landing_path text;

comment on column public.organizations.is_internal is
  'Excluded from growth metrics, including rows that already exist. Mark operator and QA workspaces with: update public.organizations set is_internal = true where lower(billing_email) in (''you@example.com'');';

alter table public.bots
  add column if not exists first_seen_origin text,
  add column if not exists first_seen_at timestamptz;

create index if not exists bots_first_seen_idx on public.bots (first_seen_at) where first_seen_origin is not null;

-- ─── Event log (service role writes; nobody else) ───────────────────────────
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (char_length(event_name) between 1 and 64),
  org_id uuid references public.organizations (id) on delete set null,
  bot_id uuid references public.bots (id) on delete set null,
  occurred_at timestamptz not null default now(),
  properties jsonb not null default '{}'::jsonb
);

create index if not exists analytics_events_name_time on public.analytics_events (event_name, occurred_at desc);
create index if not exists analytics_events_org_time on public.analytics_events (org_id, occurred_at desc);
create index if not exists analytics_events_bot_time on public.analytics_events (bot_id, occurred_at desc);

-- One row per workspace or bot for events that mean "the first time".
create unique index if not exists analytics_events_sign_up_once
  on public.analytics_events (org_id) where event_name = 'sign_up' and org_id is not null;
create unique index if not exists analytics_events_profile_once
  on public.analytics_events (org_id) where event_name = 'business_profile_created' and org_id is not null;
create unique index if not exists analytics_events_widget_once
  on public.analytics_events (bot_id) where event_name = 'widget_first_load' and bot_id is not null;
create unique index if not exists analytics_events_bot_live_once
  on public.analytics_events (bot_id) where event_name = 'bot_live' and bot_id is not null;
create unique index if not exists analytics_events_trial_limit_once
  on public.analytics_events (org_id, (properties ->> 'reason'))
  where event_name = 'trial_limit_reached' and org_id is not null;
create unique index if not exists analytics_events_subscription_once
  on public.analytics_events (org_id, (properties ->> 'razorpay_subscription_id'))
  where event_name = 'subscription_activated' and org_id is not null;

alter table public.analytics_events enable row level security;
-- No policies. anon/authenticated are denied by RLS and by the revoke below.
-- service_role has BYPASSRLS and the insert/select grant.
revoke all on table public.analytics_events from public, anon, authenticated, service_role;
grant select, insert on table public.analytics_events to service_role;

comment on table public.analytics_events is
  'Server-side growth events. RLS on, no policies: only the service role can write.';

-- ─── metrics schema (not part of the Data API) ──────────────────────────────
-- PostgREST serves only schemas listed in the project's Exposed schemas
-- (pgrst.db_schemas). This migration does not add `metrics` there, and it
-- revokes usage from anon, authenticated and service_role so adding it later
-- still returns permission denied.
create schema if not exists metrics;
comment on schema metrics is
  'Read-only growth metrics for an analyst. Do not add this schema to Exposed schemas.';

revoke all on schema metrics from public;
revoke all on schema metrics from anon, authenticated, service_role;

-- Ex-GST monthly price. Must match lib/plans.ts defaults (PRICE_STARTER_INR / PRICE_GROWTH_INR).
create or replace function metrics.plan_mrr_inr(plan text)
returns integer
language sql
immutable
as $$
  select case plan when 'starter' then 2999 when 'growth' then 9999 else 0 end
$$;

create or replace function metrics.ist_day(ts timestamptz)
returns date
language sql
immutable
as $$
  select (ts at time zone 'Asia/Kolkata')::date
$$;

-- True for botly.in, www.botly.in, *.vercel.app, localhost and 127.0.0.1.
-- Null and unparseable values are ignored (they are not a customer site).
create or replace function metrics.ignored_origin(raw text)
returns boolean
language sql
immutable
as $$
  with host as (
    select lower(split_part(split_part(regexp_replace(coalesce(raw, ''), '^[a-z][a-z0-9+.-]*://', '', 'i'), '/', 1), ':', 1)) as h
  )
  select case
    when raw is null or btrim(raw) = '' then true
    when (select h from host) in ('botly.in', 'www.botly.in', 'localhost', '127.0.0.1') then true
    when (select h from host) like '%.vercel.app' then true
    else false
  end
$$;

revoke all on function metrics.plan_mrr_inr(text) from public, anon, authenticated, service_role;
revoke all on function metrics.ist_day(timestamptz) from public, anon, authenticated, service_role;
revoke all on function metrics.ignored_origin(text) from public, anon, authenticated, service_role;

-- One row per IST day, from the first customer workspace through today.
-- Internal and demo organizations are excluded everywhere.
create or replace view metrics.daily_funnel
with (security_invoker = false) as
with customers as (
  select *
  from public.organizations
  where is_internal = false and is_demo = false
),
days as (
  select gs::date as day
  from generate_series(
    coalesce((select min(metrics.ist_day(created_at)) from customers), metrics.ist_day(now()))::timestamp,
    metrics.ist_day(now())::timestamp,
    interval '1 day'
  ) as gs
),
signups as (
  select metrics.ist_day(created_at) as day, count(*)::int as signups
  from customers
  group by 1
),
signup_sources as (
  select day, coalesce(jsonb_object_agg(source, n), '{}'::jsonb) as signups_by_source
  from (
    select metrics.ist_day(created_at) as day,
           coalesce(nullif(btrim(utm_source), ''), 'direct') as source,
           count(*)::int as n
    from customers
    group by 1, 2
  ) s
  group by day
),
first_live as (
  select distinct on (c.bot_id) c.bot_id, metrics.ist_day(c.created_at) as day
  from public.conversations c
  join public.bots b on b.id = c.bot_id
  join customers o on o.id = b.org_id
  where c.is_test = false
    and not metrics.ignored_origin(c.page_url)
  order by c.bot_id, c.created_at
),
live_new as (
  select day, count(*)::int as bots_live_new from first_live group by day
),
live_cum as (
  select d.day,
         coalesce(n.bots_live_new, 0)::int as bots_live_new,
         (sum(coalesce(n.bots_live_new, 0)) over (order by d.day))::int as bots_live_total
  from days d
  left join live_new n on n.day = d.day
),
paid_events as (
  select e.org_id, e.occurred_at as paid_at, 'on'::text as state, nullif(e.properties ->> 'plan', '') as plan
  from public.analytics_events e
  where e.event_name = 'subscription_activated' and e.org_id is not null
  union all
  select e.org_id, e.occurred_at, 'off', null
  from public.analytics_events e
  where e.event_name = 'subscription_cancelled' and e.org_id is not null
  union all
  select be.org_id, be.created_at, 'on', null
  from public.billing_events be
  where be.org_id is not null
    and be.event in ('subscription.activated', 'subscription.authenticated', 'subscription.charged')
  union all
  select be.org_id, be.created_at, 'off', null
  from public.billing_events be
  where be.org_id is not null
    and be.event in ('subscription.cancelled', 'subscription.completed', 'subscription.expired', 'subscription.halted')
),
first_paid as (
  select org_id, min(paid_at) as paid_at
  from paid_events
  where state = 'on'
  group by org_id
),
paid_asof as (
  select distinct on (d.day, e.org_id) d.day, e.org_id, e.state
  from days d
  join paid_events e on e.paid_at < ((d.day + 1)::timestamp at time zone 'Asia/Kolkata')
  join customers o on o.id = e.org_id
  order by d.day, e.org_id, e.paid_at desc
),
-- Plan is remembered from the latest event that named one (subscription_activated).
-- A later subscription.charged row has no plan; it must not wipe the price, and
-- it must not depend on organizations.plan, which is rewritten to trial on cancel.
paid_plan as (
  select distinct on (d.day, e.org_id) d.day, e.org_id, e.plan
  from days d
  join paid_events e
    on e.plan is not null
   and e.paid_at < ((d.day + 1)::timestamp at time zone 'Asia/Kolkata')
  join customers o on o.id = e.org_id
  order by d.day, e.org_id, e.paid_at desc
),
paid_on as (
  select p.day,
         count(*)::int as paid_total,
         coalesce(sum(metrics.plan_mrr_inr(coalesce(pp.plan, case when o.plan in ('starter', 'growth') then o.plan else null end))), 0)::int as mrr_inr
  from paid_asof p
  join customers o on o.id = p.org_id
  left join paid_plan pp on pp.day = p.day and pp.org_id = p.org_id
  where p.state = 'on'
  group by p.day
),
paid_new as (
  select metrics.ist_day(fp.paid_at) as day, count(*)::int as paid_new
  from first_paid fp
  join customers o on o.id = fp.org_id
  group by 1
),
reply_hit as (
  select o.id as org_id,
         (
           select m.created_at
           from public.messages m
           join public.conversations c on c.id = m.conversation_id
           join public.bots b on b.id = c.bot_id
           where b.org_id = o.id and m.role = 'assistant' and c.is_test = false
           order by m.created_at
           offset (o.trial_reply_limit - 1)
           limit 1
         ) as hit_at
  from customers o
  where o.trial_reply_limit > 0 and o.trial_replies_used >= o.trial_reply_limit
),
expiry as (
  select o.id as org_id,
         case
           when o.trial_ends_at is not null and o.trial_ends_at <= now()
                and (h.hit_at is null or o.trial_ends_at <= h.hit_at) then o.trial_ends_at
           when h.hit_at is not null and h.hit_at <= now() then h.hit_at
           else null
         end as expired_at
  from customers o
  left join reply_hit h on h.org_id = o.id
  where o.plan = 'trial' and o.trial_reply_limit > 0
),
expired_days as (
  select metrics.ist_day(expired_at) as day, count(*)::int as trials_expired
  from expiry
  where expired_at is not null
  group by 1
),
reply_windows as (
  select d.day, b.org_id, count(*)::int as n
  from days d
  join public.messages m
    on m.role = 'assistant'
   and m.created_at >= ((d.day + 1)::timestamp at time zone 'Asia/Kolkata') - interval '7 days'
   and m.created_at < ((d.day + 1)::timestamp at time zone 'Asia/Kolkata')
  join public.conversations c on c.id = m.conversation_id and c.is_test = false
  join public.bots b on b.id = c.bot_id
  join customers o on o.id = b.org_id
  group by d.day, b.org_id
),
active_trials as (
  select d.day, count(*)::int as active_trials
  from days d
  join customers o
    on o.created_at < ((d.day + 1)::timestamp at time zone 'Asia/Kolkata')
   and o.trial_reply_limit > 0
   and o.suspended = false
   and (o.trial_ends_at is null or o.trial_ends_at >= ((d.day + 1)::timestamp at time zone 'Asia/Kolkata'))
   and (o.plan = 'trial' or exists (select 1 from first_paid fp where fp.org_id = o.id))
  left join first_paid fp on fp.org_id = o.id
  join reply_windows w on w.day = d.day and w.org_id = o.id and w.n >= 10
  where fp.paid_at is null or fp.paid_at >= ((d.day + 1)::timestamp at time zone 'Asia/Kolkata')
  group by d.day
),
ai_by_day as (
  select metrics.ist_day(m.created_at) as day, count(*)::int as ai_replies
  from public.messages m
  join public.conversations c on c.id = m.conversation_id and c.is_test = false
  join public.bots b on b.id = c.bot_id
  join customers o on o.id = b.org_id
  where m.role = 'assistant'
  group by 1
)
select d.day,
       coalesce(s.signups, 0)::int as signups,
       coalesce(ss.signups_by_source, '{}'::jsonb) as signups_by_source,
       lc.bots_live_new,
       lc.bots_live_total,
       coalesce(a.active_trials, 0)::int as active_trials,
       coalesce(ex.trials_expired, 0)::int as trials_expired,
       coalesce(pn.paid_new, 0)::int as paid_new,
       coalesce(po.paid_total, 0)::int as paid_total,
       coalesce(po.mrr_inr, 0)::int as mrr_inr,
       coalesce(ai.ai_replies, 0)::int as ai_replies
from days d
left join signups s on s.day = d.day
left join signup_sources ss on ss.day = d.day
join live_cum lc on lc.day = d.day
left join active_trials a on a.day = d.day
left join expired_days ex on ex.day = d.day
left join paid_new pn on pn.day = d.day
left join paid_on po on po.day = d.day
left join ai_by_day ai on ai.day = d.day
order by d.day;

comment on view metrics.daily_funnel is
  'IST-day funnel. Excludes is_internal and is_demo. active_trials = trial workspaces with 10 or more non-test assistant replies in the 7 days ending that day. MRR is ex-GST (Starter 2999, Growth 9999). AI replies are assistant messages, not usage_monthly.messages.';

-- Live snapshot. Paid counts use organizations.plan and subscription_status,
-- so a plan set by the super admin (no Razorpay event) is included here.
create or replace view metrics.current_status
with (security_invoker = false) as
with customers as (
  select * from public.organizations where is_internal = false and is_demo = false
),
paid as (
  select * from customers
  where plan in ('starter', 'growth') and subscription_status = 'active' and suspended = false
),
replies as (
  select b.org_id,
         (count(*) filter (where m.created_at >= now() - interval '7 days'))::int as d7,
         (count(*) filter (where metrics.ist_day(m.created_at) = metrics.ist_day(now())))::int as today
  from public.messages m
  join public.conversations c on c.id = m.conversation_id and c.is_test = false
  join public.bots b on b.id = c.bot_id
  join customers o on o.id = b.org_id
  where m.role = 'assistant'
  group by b.org_id
)
select now() as as_of,
       (select count(*)::int from customers) as signups,
       (select count(*)::int from customers where metrics.ist_day(created_at) = metrics.ist_day(now())) as signups_today,
       (
         select coalesce(jsonb_object_agg(source, n), '{}'::jsonb)
         from (
           select coalesce(nullif(btrim(utm_source), ''), 'direct') as source, count(*)::int as n
           from customers
           group by 1
         ) s
       ) as signups_by_source,
       (
         select count(distinct c.bot_id)::int
         from public.conversations c
         join public.bots b on b.id = c.bot_id
         join customers o on o.id = b.org_id
         where c.is_test = false and not metrics.ignored_origin(c.page_url)
       ) as bots_live,
       (
         select count(*)::int
         from public.bots b
         join customers o on o.id = b.org_id
         where b.first_seen_origin is not null
       ) as widgets_seen,
       (
         select count(*)::int
         from customers o
         join replies r on r.org_id = o.id and r.d7 >= 10
         where o.plan = 'trial'
           and o.suspended = false
           and o.trial_reply_limit > 0
           and o.trial_replies_used < o.trial_reply_limit
           and (o.trial_ends_at is null or o.trial_ends_at > now())
       ) as active_trials,
       (
         select count(*)::int
         from customers o
         where o.plan = 'trial'
           and o.trial_reply_limit > 0
           and (
             (o.trial_ends_at is not null and o.trial_ends_at <= now())
             or o.trial_replies_used >= o.trial_reply_limit
           )
       ) as trials_expired,
       (select count(*)::int from paid) as paid,
       (select count(*)::int from paid where plan = 'starter') as paid_starter,
       (select count(*)::int from paid where plan = 'growth') as paid_growth,
       (select coalesce(sum(metrics.plan_mrr_inr(plan)), 0)::int from paid) as mrr_inr,
       (select coalesce(sum(today), 0)::int from replies) as ai_replies_today,
       (select coalesce(sum(d7), 0)::int from replies) as ai_replies_7d,
       (
         select count(*)::int
         from public.leads l
         join public.bots b on b.id = l.bot_id
         join customers o on o.id = b.org_id
         left join public.conversations c on c.id = l.conversation_id
         where l.created_at >= now() - interval '7 days'
           and coalesce(c.is_test, false) = false
       ) as leads_7d;

comment on view metrics.current_status is
  'One row. Customer workspaces only (not internal, not demo). active_trials have 10 or more AI replies in the last 7 days and a trial that has not run out. MRR is ex-GST.';

revoke all on metrics.daily_funnel from public, anon, authenticated, service_role;
revoke all on metrics.current_status from public, anon, authenticated, service_role;

-- Read-only role, no password and no login. Enabling login is a manual step
-- (supabase/manual/metrics_reader.sql) so the password never enters git.
-- If this database refuses CREATE ROLE inside the migration transaction, the
-- notice tells you to run that file; the views above are still created.
do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'metrics_reader') then
    create role metrics_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
exception
  when others then
    raise notice 'metrics_reader was not created (%). Run supabase/manual/metrics_reader.sql outside this migration.', sqlerrm;
end
$role$;

do $grant$
begin
  if exists (select 1 from pg_roles where rolname = 'metrics_reader') then
    grant usage on schema metrics to metrics_reader;
    grant select on metrics.daily_funnel, metrics.current_status to metrics_reader;
    grant execute on function metrics.plan_mrr_inr(text) to metrics_reader;
    grant execute on function metrics.ist_day(timestamptz) to metrics_reader;
    grant execute on function metrics.ignored_origin(text) to metrics_reader;
  end if;
end
$grant$;

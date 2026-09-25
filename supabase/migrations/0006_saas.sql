-- Self-serve SaaS: sign-up, free trial, Razorpay subscriptions, business profile.
-- Roles: memberships.role 'admin' = platform super admin (you); 'owner' = a customer
-- who owns their business workspace (self-serve sign-up or invited by you).

-- ─── Plans and trial ────────────────────────────────────────────────────────
alter table public.organizations drop constraint if exists organizations_plan_check;
alter table public.organizations add constraint organizations_plan_check check (plan in ('trial', 'starter', 'growth'));

alter table public.organizations
  add column created_by uuid references auth.users (id) on delete set null,
  add column self_serve boolean not null default false,
  add column trial_ends_at timestamptz,
  add column trial_reply_limit int not null default 50 check (trial_reply_limit >= 0),
  add column trial_replies_used int not null default 0,
  add column subscription_status text not null default 'none'
    check (subscription_status in ('none', 'trialing', 'pending', 'active', 'past_due', 'halted', 'cancelled', 'expired')),
  add column razorpay_subscription_id text unique,
  add column razorpay_plan_id text,
  add column current_period_end timestamptz,
  add column cancel_at_period_end boolean not null default false,
  add column suspended boolean not null default false,
  add column suspended_reason text,
  add column billing_email text,
  add column website_url text,
  add column social_links jsonb not null default '{}'::jsonb,
  -- The business profile document compiled at sign-up from public sources (markdown + sources used).
  add column profile_markdown text,
  add column profile_sources jsonb not null default '[]'::jsonb,
  add column profile_updated_at timestamptz,
  add column onboarding_status text not null default 'done'
    check (onboarding_status in ('pending', 'running', 'done', 'failed'));

-- One free trial per person: remember every email that has started one.
create table public.trial_claims (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now(),
  org_id uuid references public.organizations (id) on delete set null
);
alter table public.trial_claims enable row level security;
create policy trial_claims_admin on public.trial_claims for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

/**
 * Atomically use one AI reply from a trial. Returns
 *   'ok'       — allowed (not a trial, or within limits)
 *   'expired'  — trial period is over
 *   'limit'    — trial replies used up
 *   'suspended'
 */
create or replace function public.consume_reply(p_org_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select plan, suspended, trial_ends_at, trial_reply_limit, trial_replies_used
    into o from public.organizations where id = p_org_id for update;
  if not found then return 'ok'; end if;
  if o.suspended then return 'suspended'; end if;
  if o.plan <> 'trial' then return 'ok'; end if;
  if o.trial_ends_at is not null and o.trial_ends_at < now() then return 'expired'; end if;
  if o.trial_replies_used >= o.trial_reply_limit then return 'limit'; end if;
  update public.organizations set trial_replies_used = trial_replies_used + 1 where id = p_org_id;
  return 'ok';
end $$;
revoke execute on function public.consume_reply(uuid) from public, anon, authenticated;
grant execute on function public.consume_reply(uuid) to service_role;

-- ─── Billing events (Razorpay webhooks), idempotent by event id ────────────
create table public.billing_events (
  id text primary key,
  created_at timestamptz not null default now(),
  org_id uuid references public.organizations (id) on delete set null,
  event text not null,
  payload jsonb not null
);
alter table public.billing_events enable row level security;
create policy billing_events_admin on public.billing_events for select to authenticated using (public.is_admin());

-- Customers see their own plan and trial state (read-only; changes go through the server).
-- organizations already has an owner read policy from 0003.

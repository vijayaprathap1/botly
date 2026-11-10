-- 0015 New pricing (Nov 2026): Free / Starter / Growth / Pro, top-up packs, founding offer.
--
-- Additive and safe to run more than once. Run it BEFORE deploying the app that needs it:
-- the current app never writes 'free'/'pro' or touches the new tables, so it keeps working.
-- It does not change any existing workspace's plan or quota (existing rows are grandfathered).
--
-- Rollback (only if no workspace is on 'free'/'pro' yet):
--   alter table public.organizations drop constraint organizations_plan_check;
--   alter table public.organizations add constraint organizations_plan_check check (plan in ('trial','starter','growth'));
--   alter table public.organizations alter column plan set default 'starter';
--   drop function if exists public.add_topup(uuid, text, text, int, int, date);
--   drop function if exists public.claim_founding_slot(uuid, int, int);
--   drop function if exists public.confirm_founding_slot(uuid, text, int);
--   drop function if exists public.founding_slots_left(int);
--   drop table if exists public.quota_topups; drop table if exists public.founding_claims;
--   alter table public.organizations drop column if exists topup_month, drop column if exists topup_conversations;

-- ─── Plans ───────────────────────────────────────────────────────────────────
alter table public.organizations drop constraint if exists organizations_plan_check;
alter table public.organizations add constraint organizations_plan_check
  check (plan in ('trial', 'free', 'starter', 'growth', 'pro'));
alter table public.organizations alter column plan set default 'free';

-- ─── Top-up packs (₹249 = +500 conversations for the current month) ─────────
alter table public.organizations
  add column if not exists topup_month date,
  add column if not exists topup_conversations int not null default 0;

create table if not exists public.quota_topups (
  razorpay_order_id text primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  razorpay_payment_id text,
  month date not null,
  conversations int not null check (conversations > 0),
  amount_paise int not null check (amount_paise > 0),
  created_at timestamptz not null default now()
);
create index if not exists quota_topups_org_idx on public.quota_topups (org_id, month);
alter table public.quota_topups enable row level security;
revoke all on public.quota_topups from public, anon, authenticated;
grant select, insert on public.quota_topups to service_role;

-- Credits a paid order exactly once. 'added' or 'duplicate'.
create or replace function public.add_topup(
  p_org_id uuid, p_order_id text, p_payment_id text, p_amount_paise int, p_conversations int, p_month date
) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  insert into public.quota_topups (razorpay_order_id, org_id, razorpay_payment_id, month, conversations, amount_paise)
  values (p_order_id, p_org_id, p_payment_id, p_month, p_conversations, p_amount_paise)
  on conflict (razorpay_order_id) do nothing
  returning razorpay_order_id into v_id;
  if v_id is null then return 'duplicate'; end if;
  update public.organizations set
    topup_conversations = case
      when topup_month = p_month then topup_conversations + p_conversations
      when topup_month is null or topup_month < p_month then p_conversations
      else topup_conversations end,  -- a late credit for an older month never wipes a newer one
    topup_month = case when topup_month is null or topup_month < p_month then p_month else topup_month end
  where id = p_org_id;
  return 'added';
end $$;

-- ─── Founding offer (first 25 shops: Growth at ₹999/month, locked 12 months) ─
create table if not exists public.founding_claims (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  status text not null default 'reserved' check (status in ('reserved', 'active')),
  reserved_until timestamptz,
  razorpay_subscription_id text,
  activated_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.founding_claims enable row level security;
revoke all on public.founding_claims from public, anon, authenticated;
grant select, insert, update, delete on public.founding_claims to service_role;

-- Holds a slot during checkout. Paid slots and unexpired holds count against the cap.
create or replace function public.claim_founding_slot(p_org_id uuid, p_cap int, p_hold_minutes int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_status text; v_taken int;
begin
  perform pg_advisory_xact_lock(hashtext('botly-founding'));
  select status into v_status from public.founding_claims where org_id = p_org_id;
  if v_status = 'active' then return true; end if;
  if v_status = 'reserved' then
    update public.founding_claims set reserved_until = now() + make_interval(mins => p_hold_minutes) where org_id = p_org_id;
    return true;
  end if;
  select count(*) into v_taken from public.founding_claims
    where status = 'active' or reserved_until > now();
  if v_taken >= p_cap then return false; end if;
  insert into public.founding_claims (org_id, status, reserved_until)
  values (p_org_id, 'reserved', now() + make_interval(mins => p_hold_minutes));
  return true;
end $$;

-- Payment confirmed: the slot is theirs. Idempotent; the lock date is set once.
create or replace function public.confirm_founding_slot(p_org_id uuid, p_subscription_id text, p_lock_months int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.founding_claims as f (org_id, status, razorpay_subscription_id, activated_at, locked_until)
  values (p_org_id, 'active', p_subscription_id, now(), now() + make_interval(months => p_lock_months))
  on conflict (org_id) do update set
    status = 'active',
    razorpay_subscription_id = excluded.razorpay_subscription_id,
    reserved_until = null,
    activated_at = coalesce(f.activated_at, now()),
    locked_until = coalesce(f.locked_until, now() + make_interval(months => p_lock_months));
end $$;

create or replace function public.founding_slots_left(p_cap int)
returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, p_cap - count(*)::int) from public.founding_claims
  where status = 'active' or reserved_until > now();
$$;

revoke execute on function public.add_topup(uuid, text, text, int, int, date) from public, anon, authenticated;
revoke execute on function public.claim_founding_slot(uuid, int, int) from public, anon, authenticated;
revoke execute on function public.confirm_founding_slot(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.founding_slots_left(int) from public, anon, authenticated;
grant execute on function public.add_topup(uuid, text, text, int, int, date) to service_role;
grant execute on function public.claim_founding_slot(uuid, int, int) to service_role;
grant execute on function public.confirm_founding_slot(uuid, text, int) to service_role;
grant execute on function public.founding_slots_left(int) to service_role;

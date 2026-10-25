-- Launch guards: count a trial reply only after it succeeds, share one AI budget
-- across every bot, and dedupe alert emails across serverless instances.
-- Safe to run more than once. Does not rewrite bots.model (see the pull request
-- for the optional one-off UPDATE).

-- ─── Trial replies: look, then count ────────────────────────────────────────
-- check_reply is the old consume_reply gates without the increment.
-- commit_reply counts one successful trial reply. Paid plans are a no-op.
-- consume_reply stays as it was so a database updated before the app still works.

create or replace function public.check_reply(p_org_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select plan, suspended, trial_ends_at, trial_reply_limit, trial_replies_used
    into o from public.organizations where id = p_org_id;
  if not found then return 'ok'; end if;
  if o.suspended then return 'suspended'; end if;
  if o.plan <> 'trial' then return 'ok'; end if;
  if o.trial_ends_at is not null and o.trial_ends_at < now() then return 'expired'; end if;
  if o.trial_replies_used >= o.trial_reply_limit then return 'limit'; end if;
  return 'ok';
end $$;

create or replace function public.commit_reply(p_org_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select plan, suspended, trial_ends_at
    into o from public.organizations where id = p_org_id for update;
  if not found then return 'ok'; end if;
  if o.suspended then return 'suspended'; end if;
  if o.plan <> 'trial' then return 'ok'; end if;
  if o.trial_ends_at is not null and o.trial_ends_at < now() then return 'expired'; end if;
  update public.organizations set trial_replies_used = trial_replies_used + 1 where id = p_org_id;
  return 'ok';
end $$;

revoke execute on function public.check_reply(uuid) from public, anon, authenticated;
revoke execute on function public.commit_reply(uuid) from public, anon, authenticated;
grant execute on function public.check_reply(uuid) to service_role;
grant execute on function public.commit_reply(uuid) to service_role;

-- ─── Shared state: alert mute + cached deep health ──────────────────────────
create table if not exists public.platform_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.platform_state enable row level security;
-- No policies: the service role bypasses RLS; browser roles cannot read it.
revoke all on public.platform_state from public, anon, authenticated;
grant select, insert, update, delete on public.platform_state to service_role;

-- True when this caller won the window (first alert, or the previous one is old).
create or replace function public.claim_slot(p_key text, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  insert into public.platform_state as s (key, value, updated_at)
  values (left(p_key, 200), '{}'::jsonb, now())
  on conflict (key) do update
    set updated_at = now()
    where s.updated_at <= now() - make_interval(secs => greatest(p_window_seconds, 1))
  returning s.key into v_key;
  return v_key is not null;
end $$;

revoke execute on function public.claim_slot(text, int) from public, anon, authenticated;
grant execute on function public.claim_slot(text, int) to service_role;

-- ─── Global AI budget (requests + tokens, per minute and per UTC day) ───────
-- 0 on a limit means that window is not capped. A rejected call changes nothing.
-- ai_budget_add applies a signed correction after the real token count is known.

create or replace function public.ai_budget_try(
  p_requests int, p_tokens int,
  p_rpm int, p_tpm int, p_rpd int, p_tpd int
) returns table (allowed boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_min timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  v_day timestamptz := to_timestamp(floor(extract(epoch from now()) / 86400) * 86400);
  v_rpm int := 0;
  v_tpm int := 0;
  v_rpd int := 0;
  v_tpd int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('botly-ai-budget'));
  insert into public.rate_limits (key, window_start, count) values
    ('ai:rpm', v_min, 0),
    ('ai:tpm', v_min, 0),
    ('ai:rpd', v_day, 0),
    ('ai:tpd', v_day, 0)
  on conflict (key, window_start) do nothing;

  select
    coalesce(max(r.count) filter (where r.key = 'ai:rpm'), 0),
    coalesce(max(r.count) filter (where r.key = 'ai:tpm'), 0),
    coalesce(max(r.count) filter (where r.key = 'ai:rpd'), 0),
    coalesce(max(r.count) filter (where r.key = 'ai:tpd'), 0)
  into v_rpm, v_tpm, v_rpd, v_tpd
  from public.rate_limits r
  where (r.key, r.window_start) in (
    ('ai:rpm', v_min), ('ai:tpm', v_min), ('ai:rpd', v_day), ('ai:tpd', v_day)
  );

  if p_rpm > 0 and v_rpm + p_requests > p_rpm then
    return query select false, 'minute'::text;
    return;
  end if;
  if p_tpm > 0 and v_tpm + p_tokens > p_tpm then
    return query select false, 'minute'::text;
    return;
  end if;
  if p_rpd > 0 and v_rpd + p_requests > p_rpd then
    return query select false, 'day'::text;
    return;
  end if;
  if p_tpd > 0 and v_tpd + p_tokens > p_tpd then
    return query select false, 'day'::text;
    return;
  end if;

  update public.rate_limits set count = count + p_requests where key = 'ai:rpm' and window_start = v_min;
  update public.rate_limits set count = count + p_tokens where key = 'ai:tpm' and window_start = v_min;
  update public.rate_limits set count = count + p_requests where key = 'ai:rpd' and window_start = v_day;
  update public.rate_limits set count = count + p_tokens where key = 'ai:tpd' and window_start = v_day;

  if random() < 0.005 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;

  return query select true, 'ok'::text;
end $$;

create or replace function public.ai_budget_add(p_requests int, p_tokens int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_min timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  v_day timestamptz := to_timestamp(floor(extract(epoch from now()) / 86400) * 86400);
begin
  perform pg_advisory_xact_lock(hashtext('botly-ai-budget'));
  update public.rate_limits set count = greatest(0, count + p_requests) where key = 'ai:rpm' and window_start = v_min;
  update public.rate_limits set count = greatest(0, count + p_tokens) where key = 'ai:tpm' and window_start = v_min;
  update public.rate_limits set count = greatest(0, count + p_requests) where key = 'ai:rpd' and window_start = v_day;
  update public.rate_limits set count = greatest(0, count + p_tokens) where key = 'ai:tpd' and window_start = v_day;
end $$;

revoke execute on function public.ai_budget_try(int, int, int, int, int, int) from public, anon, authenticated;
revoke execute on function public.ai_budget_add(int, int) from public, anon, authenticated;
grant execute on function public.ai_budget_try(int, int, int, int, int, int) to service_role;
grant execute on function public.ai_budget_add(int, int) to service_role;

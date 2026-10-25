-- Demo guards: a slice of the shared AI budget for demo traffic, and a count of
-- knowledge drafts the demo builder refused to auto-approve.
-- Safe to run more than once. Does not touch billing tables or customer rows.
-- Requires 0011 (ai_budget_try / ai_budget_add / rate_limits).

alter table public.demo_sites add column if not exists flagged_count int not null default 0;

-- Replace the 6-arg budget functions with the same names plus a lane.
-- Customer callers omit p_lane and keep the previous behaviour.
-- Demo callers pass p_lane = 'demo' and the demo ceilings. A rejected call changes nothing.

drop function if exists public.ai_budget_try(int, int, int, int, int, int);
drop function if exists public.ai_budget_add(int, int);

create or replace function public.ai_budget_try(
  p_requests int, p_tokens int,
  p_rpm int, p_tpm int, p_rpd int, p_tpd int,
  p_lane text default 'customer',
  p_demo_rpm int default 0,
  p_demo_tpm int default 0,
  p_demo_rpd int default 0,
  p_demo_tpd int default 0
) returns table (allowed boolean, reason text)
language plpgsql security definer set search_path = public as $$
declare
  v_min timestamptz := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  v_day timestamptz := to_timestamp(floor(extract(epoch from now()) / 86400) * 86400);
  v_rpm int := 0;
  v_tpm int := 0;
  v_rpd int := 0;
  v_tpd int := 0;
  v_demo_rpm int := 0;
  v_demo_tpm int := 0;
  v_demo_rpd int := 0;
  v_demo_tpd int := 0;
  v_demo boolean := p_lane = 'demo';
begin
  perform pg_advisory_xact_lock(hashtext('botly-ai-budget'));
  insert into public.rate_limits (key, window_start, count) values
    ('ai:rpm', v_min, 0),
    ('ai:tpm', v_min, 0),
    ('ai:rpd', v_day, 0),
    ('ai:tpd', v_day, 0)
  on conflict (key, window_start) do nothing;

  if v_demo then
    insert into public.rate_limits (key, window_start, count) values
      ('ai:demo:rpm', v_min, 0),
      ('ai:demo:tpm', v_min, 0),
      ('ai:demo:rpd', v_day, 0),
      ('ai:demo:tpd', v_day, 0)
    on conflict (key, window_start) do nothing;
  end if;

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

  if v_demo then
    select
      coalesce(max(r.count) filter (where r.key = 'ai:demo:rpm'), 0),
      coalesce(max(r.count) filter (where r.key = 'ai:demo:tpm'), 0),
      coalesce(max(r.count) filter (where r.key = 'ai:demo:rpd'), 0),
      coalesce(max(r.count) filter (where r.key = 'ai:demo:tpd'), 0)
    into v_demo_rpm, v_demo_tpm, v_demo_rpd, v_demo_tpd
    from public.rate_limits r
    where (r.key, r.window_start) in (
      ('ai:demo:rpm', v_min), ('ai:demo:tpm', v_min), ('ai:demo:rpd', v_day), ('ai:demo:tpd', v_day)
    );
  end if;

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

  -- Demo slice. A capped parent with a zero demo cap blocks demos.
  -- An uncapped parent (limit 0) stays uncapped for demos too.
  if v_demo then
    if p_rpm > 0 and (p_demo_rpm <= 0 or v_demo_rpm + p_requests > p_demo_rpm) then
      return query select false, 'minute'::text;
      return;
    end if;
    if p_tpm > 0 and (p_demo_tpm <= 0 or v_demo_tpm + p_tokens > p_demo_tpm) then
      return query select false, 'minute'::text;
      return;
    end if;
    if p_rpd > 0 and (p_demo_rpd <= 0 or v_demo_rpd + p_requests > p_demo_rpd) then
      return query select false, 'day'::text;
      return;
    end if;
    if p_tpd > 0 and (p_demo_tpd <= 0 or v_demo_tpd + p_tokens > p_demo_tpd) then
      return query select false, 'day'::text;
      return;
    end if;
  end if;

  update public.rate_limits set count = count + p_requests where key = 'ai:rpm' and window_start = v_min;
  update public.rate_limits set count = count + p_tokens where key = 'ai:tpm' and window_start = v_min;
  update public.rate_limits set count = count + p_requests where key = 'ai:rpd' and window_start = v_day;
  update public.rate_limits set count = count + p_tokens where key = 'ai:tpd' and window_start = v_day;

  if v_demo then
    update public.rate_limits set count = count + p_requests where key = 'ai:demo:rpm' and window_start = v_min;
    update public.rate_limits set count = count + p_tokens where key = 'ai:demo:tpm' and window_start = v_min;
    update public.rate_limits set count = count + p_requests where key = 'ai:demo:rpd' and window_start = v_day;
    update public.rate_limits set count = count + p_tokens where key = 'ai:demo:tpd' and window_start = v_day;
  end if;

  if random() < 0.005 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;

  return query select true, 'ok'::text;
end $$;

create or replace function public.ai_budget_add(p_requests int, p_tokens int, p_lane text default 'customer')
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
  if p_lane = 'demo' then
    update public.rate_limits set count = greatest(0, count + p_requests) where key = 'ai:demo:rpm' and window_start = v_min;
    update public.rate_limits set count = greatest(0, count + p_tokens) where key = 'ai:demo:tpm' and window_start = v_min;
    update public.rate_limits set count = greatest(0, count + p_requests) where key = 'ai:demo:rpd' and window_start = v_day;
    update public.rate_limits set count = greatest(0, count + p_tokens) where key = 'ai:demo:tpd' and window_start = v_day;
  end if;
end $$;

revoke execute on function public.ai_budget_try(int, int, int, int, int, int, text, int, int, int, int) from public, anon, authenticated;
revoke execute on function public.ai_budget_add(int, int, text) from public, anon, authenticated;
grant execute on function public.ai_budget_try(int, int, int, int, int, int, text, int, int, int, int) to service_role;
grant execute on function public.ai_budget_add(int, int, text) to service_role;

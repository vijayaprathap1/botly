-- Server-side helpers. Called only with the service role from API routes.

-- ─── updated_at ─────────────────────────────────────────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger bots_updated_at before update on public.bots
  for each row execute function public.set_updated_at();
create trigger knowledge_sources_updated_at before update on public.knowledge_sources
  for each row execute function public.set_updated_at();

-- ─── Rate limiter: atomic fixed window ──────────────────────────────────────
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns table (allowed boolean, current_count int, reset_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- Opportunistic cleanup of old windows (about 1 in 200 calls).
  if random() < 0.005 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select v_count <= p_limit, v_count, v_window + make_interval(secs => p_window_seconds);
end $$;

-- ─── Start a conversation, enforcing the monthly quota atomically ──────────
-- Returns the new conversation id, or null when the quota is used up.
-- Test conversations (private test page / playground) never count toward quota.
create or replace function public.begin_conversation(
  p_bot_id uuid, p_visitor_id text, p_page_url text, p_page_title text,
  p_language text, p_month date, p_quota int, p_is_test boolean
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_used int;
  v_id uuid;
begin
  insert into public.usage_monthly (bot_id, month) values (p_bot_id, p_month)
  on conflict (bot_id, month) do nothing;

  select conversations into v_used from public.usage_monthly
  where bot_id = p_bot_id and month = p_month for update;

  if not p_is_test and v_used >= p_quota then
    return null;
  end if;

  insert into public.conversations (bot_id, visitor_id, page_url, page_title, language, first_message_at, last_message_at, is_test)
  values (p_bot_id, p_visitor_id, p_page_url, p_page_title, p_language, now(), now(), p_is_test)
  returning id into v_id;

  if not p_is_test then
    update public.usage_monthly set conversations = conversations + 1
    where bot_id = p_bot_id and month = p_month;
  end if;

  return v_id;
end $$;

-- ─── Usage + cost accounting ────────────────────────────────────────────────
create or replace function public.record_usage(
  p_bot_id uuid, p_month date, p_messages int,
  p_input bigint, p_output bigint, p_cache_read bigint, p_cache_write bigint, p_cost numeric
) returns table (conversations int, quota_warned_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  return query
  insert into public.usage_monthly as u (bot_id, month, messages, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
  values (p_bot_id, p_month, p_messages, p_input, p_output, p_cache_read, p_cache_write, p_cost)
  on conflict (bot_id, month) do update set
    messages = u.messages + excluded.messages,
    input_tokens = u.input_tokens + excluded.input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens,
    cache_read_tokens = u.cache_read_tokens + excluded.cache_read_tokens,
    cache_write_tokens = u.cache_write_tokens + excluded.cache_write_tokens,
    cost_usd = u.cost_usd + excluded.cost_usd
  returning u.conversations, u.quota_warned_at;
end $$;

-- Marks the 80% warning as sent exactly once per bot per month. Returns true if this call claimed it.
create or replace function public.claim_quota_warning(p_bot_id uuid, p_month date)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_rows int;
begin
  update public.usage_monthly set quota_warned_at = now()
  where bot_id = p_bot_id and month = p_month and quota_warned_at is null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;

-- ─── Conversation bookkeeping ───────────────────────────────────────────────
create or replace function public.touch_conversation(p_conversation_id uuid, p_messages int, p_language text)
returns void
language sql security definer set search_path = public, extensions as $$
  update public.conversations
  set message_count = message_count + p_messages,
      last_message_at = now(),
      language = coalesce(p_language, language)
  where id = p_conversation_id;
$$;

-- ─── Unanswered questions, merging near-duplicates (trigram similarity) ────
create or replace function public.merge_unanswered(
  p_bot_id uuid, p_conversation_id uuid, p_question text, p_language text
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  select id into v_id from public.unanswered_questions
  where bot_id = p_bot_id and status = 'open'
    and similarity(lower(question), lower(p_question)) >= 0.5
  order by similarity(lower(question), lower(p_question)) desc
  limit 1;

  if v_id is not null then
    update public.unanswered_questions
    set count = count + 1, last_asked_at = now()
    where id = v_id;
  else
    insert into public.unanswered_questions (bot_id, conversation_id, question, language)
    values (p_bot_id, p_conversation_id, left(p_question, 500), p_language)
    returning id into v_id;
  end if;

  if p_conversation_id is not null then
    update public.conversations set had_unanswered = true where id = p_conversation_id;
  end if;
  return v_id;
end $$;

-- Only the server (service role) may call these.
revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
revoke execute on function public.begin_conversation(uuid, text, text, text, text, date, int, boolean) from public, anon, authenticated;
revoke execute on function public.record_usage(uuid, date, int, bigint, bigint, bigint, bigint, numeric) from public, anon, authenticated;
revoke execute on function public.claim_quota_warning(uuid, date) from public, anon, authenticated;
revoke execute on function public.touch_conversation(uuid, int, text) from public, anon, authenticated;
revoke execute on function public.merge_unanswered(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
grant execute on function public.begin_conversation(uuid, text, text, text, text, date, int, boolean) to service_role;
grant execute on function public.record_usage(uuid, date, int, bigint, bigint, bigint, bigint, numeric) to service_role;
grant execute on function public.claim_quota_warning(uuid, date) to service_role;
grant execute on function public.touch_conversation(uuid, int, text) to service_role;
grant execute on function public.merge_unanswered(uuid, uuid, text, text) to service_role;

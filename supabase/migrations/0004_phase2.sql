-- Phase 2: owner invites, answer suggestions, cost privacy, retrieval chunks,
-- monthly report, visitor data deletion, retention.

-- ─── Owner invites ──────────────────────────────────────────────────────────
-- The admin invites a client by email; the membership is created the first time
-- that email signs in (auth callback → accept_invites).
create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role text not null default 'owner' check (role = 'owner'),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id) on delete set null,
  unique (org_id, email)
);
alter table public.org_invites enable row level security;
create policy invites_admin_all on public.org_invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.accept_invites(p_user_id uuid, p_email text)
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record;
begin
  for r in select id, org_id from public.org_invites where email = lower(p_email) and accepted_at is null loop
    insert into public.memberships (user_id, org_id, role) values (p_user_id, r.org_id, 'owner')
    on conflict do nothing;
    update public.org_invites set accepted_at = now(), accepted_user_id = p_user_id where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
-- For invites to people who already have an account.
create or replace function public.accept_invites_for_email(p_email text)
returns int
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user is null then return 0; end if;
  return public.accept_invites(v_user, p_email);
end $$;
revoke execute on function public.accept_invites(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_invites(uuid, text) to service_role;
revoke execute on function public.accept_invites_for_email(text) from public, anon, authenticated;
grant execute on function public.accept_invites_for_email(text) to service_role;

-- ─── Unanswered: owners suggest answers, the admin approves ────────────────
alter table public.unanswered_questions
  add column suggested_answer text,
  add column suggested_by uuid references auth.users (id) on delete set null,
  add column suggested_at timestamptz;

create policy unanswered_owner_suggest on public.unanswered_questions for update to authenticated
  using (bot_id in (select public.user_bot_ids())) with check (bot_id in (select public.user_bot_ids()));

-- Owners may only touch the suggestion columns (admins may change anything).
create or replace function public.guard_unanswered_owner_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.status is distinct from old.status or new.answer_source_id is distinct from old.answer_source_id
     or new.question is distinct from old.question or new.count is distinct from old.count
     or new.bot_id is distinct from old.bot_id then
    raise exception 'owners can only suggest answers';
  end if;
  new.suggested_by := auth.uid();
  new.suggested_at := now();
  return new;
end $$;
create trigger unanswered_owner_guard before update on public.unanswered_questions
  for each row execute function public.guard_unanswered_owner_update();

-- ─── Cost stays private: owners can read transcripts but not token/cost columns ──
-- (Admin screens read cost with the service role after checking the admin session.)
revoke select on public.messages from authenticated;
grant select (id, created_at, conversation_id, role, content, language, tool_calls, latency_ms, first_token_ms)
  on public.messages to authenticated;

-- ─── Retrieval mode: chunks + embeddings (pgvector) ─────────────────────────
create extension if not exists vector with schema extensions;

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  bot_id uuid not null references public.bots (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  token_count int not null default 0,
  source_updated_at timestamptz not null,
  embedding extensions.vector(1024),
  embedding_model text,
  fts tsvector generated always as (to_tsvector('simple', content)) stored,
  unique (source_id, chunk_index)
);
create index knowledge_chunks_bot on public.knowledge_chunks (bot_id);
create index knowledge_chunks_fts on public.knowledge_chunks using gin (fts);
create index knowledge_chunks_trgm on public.knowledge_chunks using gin (content extensions.gin_trgm_ops);
create index knowledge_chunks_embedding on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);
alter table public.knowledge_chunks enable row level security;
create policy chunks_admin_all on public.knowledge_chunks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Semantic search (cosine similarity).
create or replace function public.match_chunks(p_bot_id uuid, p_embedding extensions.vector, p_count int)
returns table (id uuid, source_id uuid, content text, score float)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.source_id, c.content, 1 - (c.embedding <=> p_embedding) as score
  from public.knowledge_chunks c
  where c.bot_id = p_bot_id and c.embedding is not null
  order by c.embedding <=> p_embedding
  limit p_count;
$$;

-- Keyword search, used when no embedding provider is configured (and to mix in exact terms).
create or replace function public.search_chunks_text(p_bot_id uuid, p_query text, p_count int)
returns table (id uuid, source_id uuid, content text, score float)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.source_id, c.content,
         (ts_rank(c.fts, websearch_to_tsquery('simple', p_query)) * 2 + word_similarity(lower(p_query), lower(c.content)))::float as score
  from public.knowledge_chunks c
  where c.bot_id = p_bot_id
    and (c.fts @@ websearch_to_tsquery('simple', p_query) or word_similarity(lower(p_query), lower(c.content)) > 0.25)
  order by score desc
  limit p_count;
$$;

revoke execute on function public.match_chunks(uuid, extensions.vector, int) from public, anon, authenticated;
revoke execute on function public.search_chunks_text(uuid, text, int) from public, anon, authenticated;
grant execute on function public.match_chunks(uuid, extensions.vector, int) to service_role;
grant execute on function public.search_chunks_text(uuid, text, int) to service_role;

-- ─── Monthly report (RLS applies: security invoker) ────────────────────────
create or replace function public.bot_report(p_bot_id uuid, p_from timestamptz, p_to timestamptz, p_tz text)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with conv as (
    select * from public.conversations
    where bot_id = p_bot_id and not is_test and first_message_at >= p_from and first_message_at < p_to
  ),
  firsts as (
    select distinct on (m.conversation_id) m.conversation_id,
           left(lower(regexp_replace(trim(m.content), '\s+', ' ', 'g')), 140) as q
    from public.messages m join conv c on c.id = m.conversation_id
    where m.role = 'user'
    order by m.conversation_id, m.created_at
  )
  select jsonb_build_object(
    'conversations', (select count(*) from conv),
    'unique_visitors', (select count(distinct visitor_id) from conv),
    'messages', (select coalesce(sum(message_count), 0) from conv),
    'leads', (select count(*) from public.leads l where l.bot_id = p_bot_id and l.created_at >= p_from and l.created_at < p_to
              and (l.conversation_id is null or l.conversation_id not in (select id from public.conversations where is_test))),
    'handoffs', (select count(*) from conv where status = 'handed_off'),
    'unanswered_conversations', (select count(*) from conv where had_unanswered),
    'resolved', (select count(*) from conv where status <> 'handed_off' and not had_unanswered and message_count >= 2),
    'top_questions', coalesce((select jsonb_agg(t) from (
        select q as question, count(*) as count from firsts group by q order by count(*) desc, q limit 10) t), '[]'::jsonb),
    'languages', coalesce((select jsonb_object_agg(coalesce(language, 'unknown'), n) from (
        select language, count(*) n from conv group by language) l), '{}'::jsonb),
    'by_hour', (select jsonb_agg(coalesce(h.n, 0) order by g.hour) from generate_series(0, 23) as g(hour)
        left join (select extract(hour from first_message_at at time zone p_tz)::int as hour, count(*) n from conv group by 1) h
        on h.hour = g.hour)
  );
$$;
revoke execute on function public.bot_report(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.bot_report(uuid, timestamptz, timestamptz, text) to authenticated, service_role;

-- ─── Delete one visitor's data on request (DPDP) ───────────────────────────
create or replace function public.delete_visitor_data(p_bot_id uuid, p_phone text, p_visitor_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_visitors text[];
  v_convs uuid[];
  v_leads int;
  v_conv_count int;
begin
  if coalesce(p_phone, '') = '' and coalesce(p_visitor_id, '') = '' then
    raise exception 'give a phone number or a visitor id';
  end if;
  -- Every visitor id linked to this phone or given directly.
  select array_agg(distinct v) into v_visitors from (
    select c.visitor_id as v from public.leads l join public.conversations c on c.id = l.conversation_id
      where l.bot_id = p_bot_id and p_phone <> '' and l.phone = p_phone
    union select p_visitor_id where coalesce(p_visitor_id, '') <> ''
  ) s;
  select array_agg(id) into v_convs from public.conversations
    where bot_id = p_bot_id and visitor_id = any(coalesce(v_visitors, '{}'));

  update public.unanswered_questions set conversation_id = null where conversation_id = any(coalesce(v_convs, '{}'));
  delete from public.notifications n using public.leads l
    where n.lead_id = l.id and l.bot_id = p_bot_id
      and ((p_phone <> '' and l.phone = p_phone) or l.conversation_id = any(coalesce(v_convs, '{}')));
  with d as (
    delete from public.leads l where l.bot_id = p_bot_id
      and ((p_phone <> '' and l.phone = p_phone) or l.conversation_id = any(coalesce(v_convs, '{}')))
    returning 1)
  select count(*) into v_leads from d;
  with d as (delete from public.conversations where id = any(coalesce(v_convs, '{}')) returning 1)
  select count(*) into v_conv_count from d;
  return jsonb_build_object('conversations', v_conv_count, 'leads', v_leads, 'visitors', coalesce(array_length(v_visitors, 1), 0));
end $$;
revoke execute on function public.delete_visitor_data(uuid, text, text) from public, anon, authenticated;
grant execute on function public.delete_visitor_data(uuid, text, text) to service_role;

-- ─── Retention: delete conversations and leads older than each org's setting ─
create or replace function public.purge_expired_data()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_convs int; v_leads int;
begin
  with d as (
    delete from public.conversations c using public.bots b, public.organizations o
    where c.bot_id = b.id and b.org_id = o.id
      and coalesce(c.last_message_at, c.created_at) < now() - make_interval(months => o.retention_months)
    returning 1)
  select count(*) into v_convs from d;
  with d as (
    delete from public.leads l using public.bots b, public.organizations o
    where l.bot_id = b.id and b.org_id = o.id and l.created_at < now() - make_interval(months => o.retention_months)
    returning 1)
  select count(*) into v_leads from d;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return jsonb_build_object('conversations', v_convs, 'leads', v_leads);
end $$;
revoke execute on function public.purge_expired_data() from public, anon, authenticated;
grant execute on function public.purge_expired_data() to service_role;

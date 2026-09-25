-- Botly schema. Every table: uuid pk, created_at, RLS enabled (policies in 0003).

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ─── organizations ──────────────────────────────────────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (length(name) between 1 and 200),
  business_type text not null default 'online store',
  plan text not null default 'starter' check (plan in ('starter', 'growth')),
  monthly_conversation_quota int not null default 2000 check (monthly_conversation_quota >= 0),
  timezone text not null default 'Asia/Kolkata',
  retention_months int not null default 12 check (retention_months between 1 and 120),
  minutes_saved_per_conversation numeric not null default 3
);

-- ─── memberships ────────────────────────────────────────────────────────────
-- role admin = platform operator (org_id may be null), owner = client user.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete cascade,
  role text not null check (role in ('admin', 'owner')),
  constraint owner_needs_org check (role = 'admin' or org_id is not null)
);
create unique index memberships_user_org_role on public.memberships (user_id, coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), role);
create index memberships_org on public.memberships (org_id);

-- ─── bots ───────────────────────────────────────────────────────────────────
create table public.bots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  public_key text not null unique default ('pk_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24)),
  test_token text not null unique default ('tt_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  active boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'live')),
  allowed_origins text[] not null default '{}',
  model text not null default 'claude-haiku-4-5',
  tone text not null default 'Warm, friendly and concise. Simple words. Polite, never pushy.',
  tone_suggestion text,
  languages text[] not null default '{en,ta,hi}',
  greeting text not null default 'Hi! How can I help you today?',
  nudge text,
  suggested_questions text[] not null default '{}',
  branding jsonb not null default '{"primary_color":"#4f46e5","avatar_url":null,"assistant_name":"Assistant","position":"right","theme":"auto","show_powered_by":true}',
  business_hours jsonb not null default '{"mon":[["10:00","19:00"]],"tue":[["10:00","19:00"]],"wed":[["10:00","19:00"]],"thu":[["10:00","19:00"]],"fri":[["10:00","19:00"]],"sat":[["10:00","19:00"]],"sun":[]}',
  notify_emails text[] not null default '{}',
  notify_whatsapp text[] not null default '{}',
  fallback_contact jsonb not null default '{}',
  privacy_url text,
  monthly_conversation_quota int check (monthly_conversation_quota is null or monthly_conversation_quota >= 0),
  website_url text
);
create index bots_org on public.bots (org_id);

-- ─── knowledge_sources ──────────────────────────────────────────────────────
create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  type text not null check (type in ('page', 'faq', 'policy', 'product', 'file', 'note')),
  title text not null default '',
  url text,
  content text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  token_count int not null default 0,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index knowledge_sources_bot_status on public.knowledge_sources (bot_id, status);

-- ─── conversations ──────────────────────────────────────────────────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  visitor_id text not null check (length(visitor_id) between 8 and 64),
  page_url text,
  page_title text,
  language text,
  status text not null default 'open' check (status in ('open', 'handed_off', 'closed')),
  message_count int not null default 0,
  lead_id uuid,
  first_message_at timestamptz,
  last_message_at timestamptz,
  country text,
  is_test boolean not null default false,
  had_unanswered boolean not null default false
);
create index conversations_bot_last on public.conversations (bot_id, last_message_at desc);
create index conversations_visitor on public.conversations (bot_id, visitor_id);

-- ─── messages ───────────────────────────────────────────────────────────────
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system_event')),
  content text not null default '',
  language text,
  tool_calls jsonb,
  latency_ms int,
  first_token_ms int,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0
);
create index messages_conversation on public.messages (conversation_id, created_at);

-- ─── leads ──────────────────────────────────────────────────────────────────
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  name text not null,
  phone text not null,
  email text,
  need text,
  type text not null default 'other' check (type in ('purchase', 'human', 'bulk', 'callback', 'other')),
  preferred_time text,
  status text not null default 'new' check (status in ('new', 'contacted', 'won', 'lost')),
  summary text,
  notified_email_at timestamptz,
  notified_whatsapp_at timestamptz
);
create index leads_bot_created on public.leads (bot_id, created_at desc);
create index leads_conversation on public.leads (conversation_id);
create index leads_phone on public.leads (bot_id, phone);

alter table public.conversations
  add constraint conversations_lead_fk foreign key (lead_id) references public.leads (id) on delete set null;

-- ─── unanswered_questions ───────────────────────────────────────────────────
create table public.unanswered_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  question text not null,
  language text,
  count int not null default 1,
  status text not null default 'open' check (status in ('open', 'answered', 'ignored')),
  answer_source_id uuid references public.knowledge_sources (id) on delete set null,
  last_asked_at timestamptz not null default now()
);
create index unanswered_bot_status on public.unanswered_questions (bot_id, status);
create index unanswered_question_trgm on public.unanswered_questions using gin (question extensions.gin_trgm_ops);

-- ─── usage_monthly ──────────────────────────────────────────────────────────
create table public.usage_monthly (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  month date not null,
  conversations int not null default 0,
  messages int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  quota_warned_at timestamptz,
  unique (bot_id, month)
);

-- ─── rate_limits (Postgres fixed-window limiter) ────────────────────────────
create table public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  unique (key, window_start)
);
create index rate_limits_window on public.rate_limits (window_start);

-- ─── notifications (delivery log per lead and channel) ─────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  kind text not null default 'new_lead',
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient text not null,
  status text not null check (status in ('sent', 'failed', 'pending_credentials', 'skipped')),
  attempts int not null default 0,
  error text,
  provider_id text,
  sent_at timestamptz
);
create index notifications_lead on public.notifications (lead_id);

-- ─── eval_runs (gate for going live) ────────────────────────────────────────
create table public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  passed int not null,
  total int not null,
  injection_passed boolean not null,
  first_token_p50_ms int,
  results jsonb not null default '[]'
);
create index eval_runs_bot on public.eval_runs (bot_id, created_at desc);

-- RLS on for everything (policies in 0003). With RLS on and no policy, nothing is readable.
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.bots enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.leads enable row level security;
alter table public.unanswered_questions enable row level security;
alter table public.usage_monthly enable row level security;
alter table public.rate_limits enable row level security;
alter table public.notifications enable row level security;
alter table public.eval_runs enable row level security;

-- Demo builder: a private preview of a prospect's homepage with a Botly assistant trained
-- on their website. Super admin only. A demo is its own organization + bot, so nothing
-- about it can leak into a customer's data.

-- Demo orgs are pitches, not customers: they are kept out of trial emails, revenue
-- numbers and the client list.
alter table public.organizations add column if not exists is_demo boolean not null default false;

create table if not exists public.demo_sites (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  slug               text not null unique check (slug ~ '^[A-Za-z0-9_-]{22,64}$'),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  bot_id             uuid not null references public.bots (id) on delete cascade,
  source_url         text not null,
  final_url          text,                 -- after redirects; the base for every asset
  business_name      text not null,
  html               text,                 -- cleaned homepage copy (null until ready, and again after expiry)
  html_bytes         int,
  mode               text not null default 'static' check (mode in ('static', 'rendered')),
  status             text not null default 'pending'
                     check (status in ('pending', 'copying', 'training', 'ready', 'failed', 'expired')),
  error              text,
  progress           text,                 -- last progress line for the admin screen
  max_pages          int not null default 15,
  views              int not null default 0,
  first_viewed_at    timestamptz,
  last_viewed_at     timestamptz,
  opened_notified_at timestamptz,
  expires_at         timestamptz not null default now() + interval '14 days',
  created_by         uuid references auth.users (id) on delete set null
);
create index if not exists demo_sites_created_idx on public.demo_sites (created_at desc);
create index if not exists demo_sites_org_idx on public.demo_sites (org_id);
create index if not exists demo_sites_bot_idx on public.demo_sites (bot_id);

alter table public.demo_sites enable row level security;
drop policy if exists demo_sites_admin_all on public.demo_sites;
create policy demo_sites_admin_all on public.demo_sites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- No anon or owner policy: the public page reads through the service role, by slug.

-- Counts a view of a live demo. Returns true only for the very first view.
create or replace function public.record_demo_view(p_slug text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_views int;
begin
  update public.demo_sites
     set views = views + 1,
         first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at = now()
   where slug = p_slug and status = 'ready' and expires_at > now()
  returning views into v_views;
  return coalesce(v_views = 1, false);
end $$;
revoke execute on function public.record_demo_view(text) from public, anon, authenticated;
grant execute on function public.record_demo_view(text) to service_role;

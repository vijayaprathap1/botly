-- Brings a database that already has the first draft of the demo tables (from the plan
-- document) in line with what the code uses. Safe to run on any database, more than once.

-- How many pages the assistant reads for this demo (used again by Retrain).
alter table public.demo_sites add column if not exists max_pages int not null default 15;

-- The first draft returned a table; the code expects a single true/false.
-- Postgres can't change a function's return type in place, so drop it first.
drop function if exists public.record_demo_view(text);

create function public.record_demo_view(p_slug text)
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

create index if not exists demo_sites_org_idx on public.demo_sites (org_id);
create index if not exists demo_sites_bot_idx on public.demo_sites (bot_id);

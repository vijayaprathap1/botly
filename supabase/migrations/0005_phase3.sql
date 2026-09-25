-- Phase 3 (Growth plan): store integrations for order lookup.
-- Credentials are encrypted in the app (AES-256-GCM, ENCRYPTION_KEY) before they
-- reach the database, and the browser roles can't even read the ciphertext.

create table public.bot_integrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  provider text not null check (provider in ('shopify', 'woocommerce')),
  store_url text not null,
  credentials_encrypted text not null,
  status text not null default 'unverified' check (status in ('unverified', 'ok', 'error')),
  last_checked_at timestamptz,
  last_error text,
  unique (bot_id, provider)
);
create trigger bot_integrations_updated_at before update on public.bot_integrations
  for each row execute function public.set_updated_at();
alter table public.bot_integrations enable row level security;
create policy integrations_admin_read on public.bot_integrations for select to authenticated using (public.is_admin());

revoke all on public.bot_integrations from anon, authenticated;
grant select (id, created_at, updated_at, bot_id, provider, store_url, status, last_checked_at, last_error)
  on public.bot_integrations to authenticated;
-- Writes go through server actions using the service role after an admin check.

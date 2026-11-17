-- 0016 Appointment booking (v1): per-assistant booking settings, services, date overrides
-- (holidays / special hours) and appointments.
--
-- Additive and safe to run more than once. Booking is OFF for every assistant until the
-- owner switches it on in the dashboard, so running this changes nothing a visitor sees.
-- Run it BEFORE deploying the app that uses it (the current app never touches these tables).
--
-- Access: like every other bot-scoped table, admins can do everything and owners can read
-- their own rows through RLS. All writes (dashboard saves, widget bookings) go through the
-- server with the service role, after the server has checked who is asking.
--
-- Double booking: a BEFORE INSERT/UPDATE trigger takes a per-assistant advisory lock and
-- counts the active (pending/confirmed) appointments that overlap the new one, buffer
-- included. Two visitors racing for the last place cannot both get it, whichever path the
-- row comes from. A partial unique index also stops the same phone number booking the same
-- start time twice (a double tap on "Confirm").
--
-- Rollback (only if nothing depends on bookings yet):
--   drop trigger if exists appointments_capacity_guard on public.appointments;
--   drop function if exists public.appointments_capacity_guard();
--   drop table if exists public.appointments, public.booking_date_overrides,
--     public.booking_services, public.booking_settings;

-- ─── Settings (one row per assistant) ────────────────────────────────────────
create table if not exists public.booking_settings (
  bot_id uuid primary key references public.bots (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  enabled boolean not null default false,
  title text not null default 'Book an appointment' check (length(title) between 2 and 60),
  timezone text not null default 'Asia/Kolkata',
  -- How often start times are offered (10:00, 10:30, …).
  slot_interval_minutes int not null default 30 check (slot_interval_minutes between 5 and 240),
  -- Free time kept before and after every appointment.
  buffer_minutes int not null default 0 check (buffer_minutes between 0 and 240),
  -- Earliest a visitor can book, from now (60 = not within the next hour).
  min_notice_minutes int not null default 60 check (min_notice_minutes between 0 and 20160),
  -- How far ahead the calendar is open (days, today = day 0).
  max_days_ahead int not null default 30 check (max_days_ahead between 1 and 180),
  -- People who can be seen at the same time (doctors, chairs, trainers, seats in a class).
  capacity_per_slot int not null default 1 check (capacity_per_slot between 1 and 50),
  -- Optional cap on bookings in one day (null = no cap).
  daily_limit int check (daily_limit is null or daily_limit between 1 and 1000),
  -- auto: the booking is confirmed at once. manual: it waits for the owner to confirm.
  confirmation_mode text not null default 'auto' check (confirmation_mode in ('auto', 'manual')),
  -- Email on the booking form: off, optional or required. Phone is always required.
  collect_email text not null default 'optional' check (collect_email in ('off', 'optional', 'required')),
  -- Weekly hours in the booking timezone; several ranges per day leave gaps for breaks.
  weekly_hours jsonb not null default '{"mon":[["10:00","13:00"],["14:00","19:00"]],"tue":[["10:00","13:00"],["14:00","19:00"]],"wed":[["10:00","13:00"],["14:00","19:00"]],"thu":[["10:00","13:00"],["14:00","19:00"]],"fri":[["10:00","13:00"],["14:00","19:00"]],"sat":[["10:00","13:00"],["14:00","19:00"]],"sun":[]}',
  -- Shown after booking and in the confirmation email ("Please bring old reports").
  instructions text check (instructions is null or length(instructions) <= 500),
  cancellation_policy text check (cancellation_policy is null or length(cancellation_policy) <= 300),
  -- Email the customer when they book (and when the owner confirms or cancels).
  notify_customer boolean not null default true
);

-- ─── Services (what can be booked, and how long it takes) ───────────────────
create table if not exists public.booking_services (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  name text not null check (length(name) between 2 and 80),
  description text check (description is null or length(description) <= 300),
  duration_minutes int not null default 30 check (duration_minutes between 5 and 480),
  -- Shown as a guide only; Botly does not take payment for bookings in v1.
  price_inr int check (price_inr is null or price_inr between 0 and 10000000),
  active boolean not null default true,
  sort int not null default 0
);
create index if not exists booking_services_bot on public.booking_services (bot_id, sort);

-- ─── Date overrides: holidays (closed) or special hours for one date ────────
create table if not exists public.booking_date_overrides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  date date not null,
  closed boolean not null default true,
  hours jsonb not null default '[]',
  note text check (note is null or length(note) <= 120),
  unique (bot_id, date)
);

-- ─── Appointments ────────────────────────────────────────────────────────────
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  service_id uuid references public.booking_services (id) on delete set null,
  -- Copied at booking time, so renaming or deleting a service keeps the history readable.
  service_name text not null,
  duration_minutes int not null check (duration_minutes between 5 and 480),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  customer_name text not null check (length(customer_name) between 2 and 80),
  customer_phone text not null check (length(customer_phone) between 8 and 20),
  customer_email text check (customer_email is null or length(customer_email) <= 200),
  notes text check (notes is null or length(notes) <= 500),
  conversation_id uuid references public.conversations (id) on delete set null,
  visitor_id text,
  source text not null default 'widget' check (source in ('widget', 'chat', 'dashboard')),
  is_test boolean not null default false,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 300),
  completed_at timestamptz,
  business_notified_at timestamptz,
  customer_notified_at timestamptz,
  constraint appointments_end_after_start check (end_at > start_at)
);
create index if not exists appointments_bot_start on public.appointments (bot_id, start_at);
create index if not exists appointments_bot_status on public.appointments (bot_id, status, start_at);
create index if not exists appointments_conversation on public.appointments (conversation_id);
-- One phone number cannot hold the same start time twice while the booking is active.
create unique index if not exists appointments_no_duplicate
  on public.appointments (bot_id, customer_phone, start_at)
  where status in ('pending', 'confirmed');

-- ─── Capacity guard (race-safe) ──────────────────────────────────────────────
-- Rejects an active appointment when `capacity_per_slot` active appointments already overlap
-- it (buffer included), or when the day already has `daily_limit` active appointments.
-- SQLSTATE 23P01 (exclusion_violation) with message booking_slot_full / booking_day_full.
create or replace function public.appointments_capacity_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cap int;
  v_buf int;
  v_daily int;
  v_tz text;
  v_overlap int;
  v_day int;
begin
  if new.status not in ('pending', 'confirmed') then return new; end if;
  -- Confirming a booking (pending → confirmed) at the same time does not take a new place.
  if tg_op = 'UPDATE' and old.status in ('pending', 'confirmed')
     and old.start_at = new.start_at and old.end_at = new.end_at then
    return new;
  end if;
  -- One booking at a time per assistant; the second waits here and then sees the first.
  perform pg_advisory_xact_lock(hashtext('botly-booking:' || new.bot_id::text));
  select capacity_per_slot, buffer_minutes, daily_limit, timezone
    into v_cap, v_buf, v_daily, v_tz
    from public.booking_settings where bot_id = new.bot_id;
  v_cap := coalesce(v_cap, 1);
  v_buf := coalesce(v_buf, 0);
  v_tz := coalesce(v_tz, 'Asia/Kolkata');

  select count(*) into v_overlap from public.appointments a
   where a.bot_id = new.bot_id and a.id <> new.id and a.status in ('pending', 'confirmed')
     and a.start_at < new.end_at + make_interval(mins => v_buf)
     and a.end_at + make_interval(mins => v_buf) > new.start_at;
  if v_overlap >= v_cap then
    raise exception 'booking_slot_full' using errcode = 'exclusion_violation';
  end if;

  if v_daily is not null then
    select count(*) into v_day from public.appointments a
     where a.bot_id = new.bot_id and a.id <> new.id and a.status in ('pending', 'confirmed')
       and (a.start_at at time zone v_tz)::date = (new.start_at at time zone v_tz)::date;
    if v_day >= v_daily then
      raise exception 'booking_day_full' using errcode = 'exclusion_violation';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.appointments_capacity_guard() from public, anon, authenticated;

drop trigger if exists appointments_capacity_guard on public.appointments;
create trigger appointments_capacity_guard
  before insert or update of status, start_at, end_at on public.appointments
  for each row execute function public.appointments_capacity_guard();

-- ─── RLS: admin everything, owner read (writes go through the server) ───────
alter table public.booking_settings enable row level security;
alter table public.booking_services enable row level security;
alter table public.booking_date_overrides enable row level security;
alter table public.appointments enable row level security;

drop policy if exists booking_settings_admin_all on public.booking_settings;
create policy booking_settings_admin_all on public.booking_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists booking_settings_owner_read on public.booking_settings;
create policy booking_settings_owner_read on public.booking_settings for select to authenticated
  using (bot_id in (select public.user_bot_ids()));

drop policy if exists booking_services_admin_all on public.booking_services;
create policy booking_services_admin_all on public.booking_services for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists booking_services_owner_read on public.booking_services;
create policy booking_services_owner_read on public.booking_services for select to authenticated
  using (bot_id in (select public.user_bot_ids()));

drop policy if exists booking_overrides_admin_all on public.booking_date_overrides;
create policy booking_overrides_admin_all on public.booking_date_overrides for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists booking_overrides_owner_read on public.booking_date_overrides;
create policy booking_overrides_owner_read on public.booking_date_overrides for select to authenticated
  using (bot_id in (select public.user_bot_ids()));

drop policy if exists appointments_admin_all on public.appointments;
create policy appointments_admin_all on public.appointments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists appointments_owner_read on public.appointments;
create policy appointments_owner_read on public.appointments for select to authenticated
  using (bot_id in (select public.user_bot_ids()));

-- Nothing here is public: the widget reads availability through the server only.
revoke all on public.booking_settings, public.booking_services, public.booking_date_overrides, public.appointments from anon;

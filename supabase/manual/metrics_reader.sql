-- NOT a migration. Run by hand in the Supabase SQL editor if 0012_analytics.sql
-- could not create metrics_reader, and to turn the role into a login.
-- Do not put a password in this file or in git.
--
-- 1. Role (no password). Safe to run more than once.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'metrics_reader') then
    create role metrics_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;

grant usage on schema metrics to metrics_reader;
grant select on metrics.daily_funnel, metrics.current_status to metrics_reader;
grant execute on function metrics.plan_mrr_inr(text) to metrics_reader;
grant execute on function metrics.ist_day(timestamptz) to metrics_reader;
grant execute on function metrics.ignored_origin(text) to metrics_reader;

-- 2. In a separate statement, after choosing a long random password, enable login.
--    Do not save the statement.
--
--    alter role metrics_reader with login password '<password>';
--
-- 3. Connect through the session pooler as metrics_reader.<project-ref>.
--    The role can read metrics.daily_funnel and metrics.current_status only.
--    Confirm with:
--
--    select * from metrics.current_status;
--    select * from metrics.daily_funnel order by day desc limit 14;

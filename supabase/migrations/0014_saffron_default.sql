-- 0014: saffron (#C2410C) becomes the default widget brand colour.
-- PROPOSED, NOT APPLIED. Apply only after 0011 -> 0012 -> 0013, and only with the owner's OK.
-- Safe to run more than once: it only touches values that are still exactly the old
-- indigo default (#4f46e5, any letter case); every other colour is left alone.

-- Existing bots still on the old default colour.
update public.bots
set branding = jsonb_set(branding, '{primary_color}', '"#C2410C"')
where lower(branding->>'primary_color') = '#4f46e5';

-- Column default for new rows, if there is one and it still uses the old colour.
do $$
declare
  expr text;
  def jsonb;
begin
  select pg_get_expr(d.adbin, d.adrelid) into expr
  from pg_attrdef d
  join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  where d.adrelid = 'public.bots'::regclass and a.attname = 'branding';

  if expr is null then
    return;
  end if;

  execute 'select (' || expr || ')::jsonb' into def;
  if lower(def->>'primary_color') = '#4f46e5' then
    execute format('alter table public.bots alter column branding set default %L::jsonb',
                   jsonb_set(def, '{primary_color}', '"#C2410C"')::text);
  end if;
end $$;

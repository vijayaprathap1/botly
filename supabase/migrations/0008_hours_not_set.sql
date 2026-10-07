-- Business hours: "not set" instead of a made-up default.
--
-- Until now every new bot silently got Mon–Sat 10:00–19:00, and the assistant stated
-- those hours to visitors as fact (and showed "We're offline" outside them) even though
-- nobody had entered them. "Not set" is stored as open all day, every day; the app shows
-- it to the model as "not specified", so hours questions are answered from the knowledge.

-- New bots created without hours (any path that doesn't pass business_hours).
alter table public.bots alter column business_hours set default
  '{"mon":[["00:00","23:59"]],"tue":[["00:00","23:59"]],"wed":[["00:00","23:59"]],"thu":[["00:00","23:59"]],"fri":[["00:00","23:59"]],"sat":[["00:00","23:59"]],"sun":[["00:00","23:59"]]}'::jsonb;

-- Existing bots that still carry the untouched old default. A business that really is
-- open Mon–Sat 10:00–19:00 only needs to press Save once in Settings → Business hours
-- after entering it again; nothing else about the bot changes.
update public.bots
set business_hours =
  '{"mon":[["00:00","23:59"]],"tue":[["00:00","23:59"]],"wed":[["00:00","23:59"]],"thu":[["00:00","23:59"]],"fri":[["00:00","23:59"]],"sat":[["00:00","23:59"]],"sun":[["00:00","23:59"]]}'::jsonb
where business_hours =
  '{"mon":[["10:00","19:00"]],"tue":[["10:00","19:00"]],"wed":[["10:00","19:00"]],"thu":[["10:00","19:00"]],"fri":[["10:00","19:00"]],"sat":[["10:00","19:00"]],"sun":[]}'::jsonb
  -- The demo seed (Ananya Handlooms) states these hours in its knowledge on purpose.
  and public_key <> 'pk_ananya_demo_0001';

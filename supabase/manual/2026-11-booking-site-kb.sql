-- One-off, PRODUCTION ONLY (botly.in site assistant e9282c7a-…): teach the site assistant
-- about appointment booking. NOT a migration. Run only after migration 0016 is applied and
-- the booking release is live. Safe to run twice: inserts check the title, the update only
-- matches text that doesn't mention booking yet.
-- Afterwards: open Knowledge for "Botly website (botly.in)" and save any entry once, so the
-- retrieval index re-syncs.
begin;

-- Pricing answer: Starter now includes appointment booking.
update public.knowledge_sources set updated_at = now(),
  content = replace(content, '500 conversations a month; everything in Free; one-tap WhatsApp reply to leads;', '500 conversations a month; everything in Free; appointment booking with live availability; one-tap WhatsApp reply to leads;')
where id = 'e1640297-c1e6-4e4d-a462-f6b01237c4ea' and content like '%500 conversations a month; everything in Free; one-tap WhatsApp reply to leads;%';

insert into public.knowledge_sources (bot_id, type, title, status, url, content)
select 'e9282c7a-73be-4c50-8b05-643f8be403d7', 'faq', 'Can customers book appointments through Botly?', 'approved', 'https://botly.in/#booking',
'Q: Can customers book appointments through Botly?
A: Yes. Appointment booking is on the Starter plan (₹799/month) and above. Clinics, salons, gyms, tutors, consultants and home-service businesses set their days, opening hours, breaks, holidays and services in the Botly dashboard, then switch booking on. Visitors see "Book an appointment" in the chat, pick a service and a real free time, and give their name and phone number. The business gets an email for every booking and can confirm, cancel or mark it done from Bookings. Booking stays off until you turn it on.'
where not exists (select 1 from public.knowledge_sources where bot_id = 'e9282c7a-73be-4c50-8b05-643f8be403d7' and title = 'Can customers book appointments through Botly?');

insert into public.knowledge_sources (bot_id, type, title, status, url, content)
select 'e9282c7a-73be-4c50-8b05-643f8be403d7', 'faq', 'What can I control in appointment booking?', 'approved', 'https://botly.in/#booking',
'Q: What can I control in appointment booking?
A: Your weekly hours with lunch breaks or evening sessions, holidays and special hours for any date, services with their own length and optional price, the gap between appointments, how many people can book the same time, minimum notice, how many days ahead people can book, a daily limit, and whether bookings are confirmed automatically or by you. Times already booked are never offered again, so there are no double bookings. Calendar sync, online payment and SMS or WhatsApp reminders are not available yet.'
where not exists (select 1 from public.knowledge_sources where bot_id = 'e9282c7a-73be-4c50-8b05-643f8be403d7' and title = 'What can I control in appointment booking?');

insert into public.knowledge_sources (bot_id, type, title, status, url, content)
select 'e9282c7a-73be-4c50-8b05-643f8be403d7', 'faq', 'Is Botly good for doctors and clinics?', 'approved', 'https://botly.in/#booking',
'Q: Is Botly good for doctors and clinics?
A: Yes. Botly answers patients'' questions about timings, fees, location and services in English, Tamil or Hindi, and with appointment booking switched on (Starter plan and above) patients can book a consultation at a real free time right in the chat. The clinic gets an email for each booking and manages them from the dashboard. It answers only from the information the clinic has approved.'
where not exists (select 1 from public.knowledge_sources where bot_id = 'e9282c7a-73be-4c50-8b05-643f8be403d7' and title = 'Is Botly good for doctors and clinics?');

commit;

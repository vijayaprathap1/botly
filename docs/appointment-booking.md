# Appointment booking (v1)

Status: built on branch `appointment-booking`, **not merged, not deployed, migration 0016 not applied**.

## Why

Doctors and clinics we pitch ask the same thing first: "can patients book through it?" Today
Botly can only take a callback request (Growth) or a lead. Every service business (clinic,
salon, gym, tutor, consultant, home services) works on **time slots**, so booking is the
service-business version of what order lookup is for shops.

## What businesses need (analysis)

| Business | What gets booked | Length | Same time | Must handle |
| --- | --- | --- | --- | --- |
| Clinic / doctor | Consultation, follow-up, check-up | 10–30 min, check-ups 60 | 1 per doctor | Morning + evening sessions (10–1, 5–8), Sunday off, doctor's leave, "arrive early, bring reports" |
| Dental / physio | Cleaning, root canal, session | 30–90 min | 1 per chair | Different lengths per service, gap for cleaning the chair |
| Salon / spa | Haircut, facial, bridal | 30–180 min | Chairs (2–4) | Prices shown, lead time for bridal, cancellation rule |
| Gym / yoga studio | Trial class, PT session | 45–60 min | Many per class | Capacity per time, daily cap |
| Tutor / coaching | Demo class, counselling | 30–60 min | 1 or a batch | Book days ahead, weekday evenings only |
| Consultant / CA / lawyer | Call or meeting | 30–60 min | 1 | Minimum notice (next day), gaps between calls |
| Home services (AC, pest, repair) | Visit window | 1–3 hr window | Technicians (2–5) | Travel gap, daily limit per team |
| Restaurants | Table | — | Covers | Covered by OpenTable/Dineout-style tools; **not v1** |

### Patterns from Calendly, Practo, Fresha and Intercom

* **Calendly**: weekly hours plus date-specific overrides; start-time increments; buffers
  before/after; minimum notice; how far ahead people can book; daily limits.
* **Practo (Ray)**: a default appointment length; clinic timings in two sessions a day;
  confirmations and reminders by SMS; manual confirmation at the front desk.
* **Fresha**: services with their own length and price; minimum notice; booking window;
  a cancellation policy and instructions shown in the booking flow; deposits.
* **Intercom / chat tools**: booking happens *inside* the conversation, started by a button or
  by the assistant; the agent never "books" by itself, the visitor confirms in a form.

### The generic model (covers all of the above)

* **Weekly hours** per day, each day a list of ranges (gaps = breaks / sessions).
* **Date overrides**: closed (holiday, leave) or special hours for a date.
* **Services**: name, length, optional price and description. None → one generic "Appointment"
  the length of a slot.
* **Rules**: start-time step, gap between appointments (buffer), people at the same time
  (capacity), minimum notice, days ahead, daily limit, time zone (default Asia/Kolkata).
* **Confirmation**: automatic, or "I confirm each one" (pending until the owner confirms).
* **Form**: name + phone always (India-first, WhatsApp-able), email off/optional/required,
  notes. Instructions and cancellation policy are shown to the customer.

## Recommendation and decisions

1. **Plan gating: Starter (₹799) and above, plus trials/pilots. Not on Free.** Free sees the
   whole settings page and an upgrade notice, so they can set hours before paying.
   * Starter already says "for a clinic, salon or shop getting started"; booking is the
     reason a clinic pays. ₹799 is an easy yes for a doctor.
   * Trials and 30-day pilots include it so we can demo it on the pitch.
   * Growth keeps its own reasons: order lookup, callback booking, no branding, weekly summary.
   * Pricing numbers do not change.
2. **Off by default.** Nothing changes for any existing bot until the owner switches it on.
   When off (or not on the plan) the widget shows nothing new and the API answers 404.
3. **No double bookings, enforced in the database**, not only in the UI: a trigger takes a
   per-assistant lock and counts overlapping active appointments (buffer included) against the
   capacity, plus the daily limit, inside the insert.
4. **Business notified by email** (existing Resend setup, same `brandEmail` layout as leads).
   Customer gets an email if they gave one ("confirmed" or "request received"). No new paid
   service. WhatsApp/SMS reminders are deferred.
5. **The assistant can open the booking card** (`show_booking` tool) and tells the visitor the
   real nearest free times, but it never books by itself: the visitor confirms in the card.
   When booking is on, `show_booking` replaces `request_callback` for Growth bots.

## v1 scope (built)

* **Database** – `supabase/migrations/0016_appointment_booking.sql`: `booking_settings`,
  `booking_services`, `booking_date_overrides`, `appointments`; capacity/daily-limit trigger;
  duplicate guard (same phone, same start); RLS: admin all, owner read; writes via server.
* **Dashboard** – new **Bookings** item in the bot sidebar:
  * *Appointments*: Today / Upcoming / Needs confirmation counts; Upcoming, Needs confirmation,
    Past, Cancelled; grouped by day; Confirm, Cancel (asks first; emails the customer),
    Mark done (after the time), WhatsApp, link to the chat.
  * *Availability*: on/off switch, button text, confirmation mode, weekly hours with breaks
    (copy Monday to weekdays), slot step, gap, people at the same time, minimum notice, days
    ahead, daily limit, email field, customer email on/off, instructions, cancellation policy,
    holidays and special days.
  * *Services*: add / edit / remove (length, price, description).
* **Public API** – `GET/POST /api/widget/booking`: same origin allow-list / test-token check
  as chat, rate limits (60/min per IP for times; 5 per 10 min per visitor and 15 per 10 min
  per IP for bookings), plan + switch check, server-side slot re-check, 409 when taken.
* **Widget** – "Book an appointment" on the home screen and a **Book** button next to "Talk to
  a person"; card flow: service → day strip + Morning/Afternoon/Evening times → details →
  "You're booked!" / "Request sent". `window.Botly.book()` opens it from the site's own
  buttons. Bundle 26.3 KB gzip (budget 35 KB). Config cache means switching on/off shows in
  the widget within about 5 minutes.
* **Assistant** – prompt rule 12 + `show_booking` tool (only when on). Existing prompts are
  byte-identical when booking is off.
* **Marketing** – homepage "Appointment booking" section with use cases, FAQ entry, Starter
  feature list, homepage meta description; `supabase/manual/2026-11-booking-site-kb.sql`
  for the botly.in site assistant (run after release).

## Deferred (and why)

| Deferred | Why not v1 |
| --- | --- |
| Staff / doctor calendars (book a specific person) | Needs per-provider hours and capacity; v1 uses capacity for "2 chairs / 2 doctors" |
| Google Calendar / Outlook sync | OAuth + token storage; owners can WhatsApp/email from the list today |
| Payments / deposits | Razorpay change, refunds; out of scope (no billing changes) |
| SMS / WhatsApp confirmations and reminders | Needs approved WhatsApp templates / SMS cost |
| Customer self-reschedule / cancel links | Needs signed links and a public page |
| No-show status, waitlist, recurring bookings | Later, once we see real use |
| Owner adding a booking by hand in the dashboard | Owners take phone bookings in their own book today |
| Restaurant tables | Different model (covers, turns); dedicated tools exist |

## Known limits

* With capacity > 1 and services of different lengths, the overlap count is conservative: it
  never overbooks but can offer slightly fewer times than a full interval-packing check.
* Times are generated in the business time zone (IST by default; DST zones are handled).
* The booking card is shown in English (like the rest of the widget chrome); the assistant's
  reply around it follows the visitor's language.

## Rollout (needs Vijayaprathap's OK)

1. Back up the production database.
2. Apply `0016_appointment_booking.sql` (idempotent, additive only; rollback notes at the end of
   the file). Until it is applied the code treats booking as off, so merging first is safe too.
3. Merge the PR (auto-deploys to production).
4. Run `supabase/manual/2026-11-booking-site-kb.sql` and re-save one Knowledge entry for the
   botly.in assistant so retrieval re-syncs.
5. Switch booking on for a pilot clinic, make a test booking from its test link, check the
   email and the Bookings list.

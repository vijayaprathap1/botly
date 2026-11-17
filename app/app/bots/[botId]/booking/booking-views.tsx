import Link from "next/link";
import { CalendarDays, Check, CheckCheck, Phone, Trash2, X } from "lucide-react";
import { deleteBookingService, deleteDateOverride, setAppointmentStatus } from "@/app/app/booking-actions";
import { Badge, btn, Card, Empty, Notice, Stat, TabLink } from "@/components/ui";
import { dayLabel, localDate, localTime, time12 } from "@/lib/booking/slots";
import type { AppointmentRow, AppointmentStatus, BookingServiceRow, BookingSettingsRow, DateOverrideRow } from "@/lib/booking/types";
import { bookingPlan, fmtInr } from "@/lib/plans";
import { whatsappLink } from "@/lib/validation/phone";
import { BookingSettingsForm, ConfirmSubmit, OverrideForm, ServiceForm } from "./booking-forms";

/** Dashboard booking views. Data comes from page.tsx (or mock data in the screenshot preview). */
export const VIEWS = { upcoming: "Upcoming", pending: "Needs confirmation", past: "Past", cancelled: "Cancelled" } as const;
export type View = keyof typeof VIEWS;
const TONE: Record<AppointmentStatus, "green" | "amber" | "gray" | "red"> = { confirmed: "green", pending: "amber", completed: "gray", cancelled: "red" };
const LABEL: Record<AppointmentStatus, string> = { confirmed: "Confirmed", pending: "Needs confirmation", completed: "Done", cancelled: "Cancelled" };

export function AppointmentsView({ botId, view, tz, nowIso, org, base, rows, active }: { botId: string; view: View; tz: string; nowIso: string; org: string; base: string; rows: AppointmentRow[]; active: Pick<AppointmentRow, "start_at" | "status">[] }) {
  const today = localDate(new Date(nowIso), tz);
  const todayCount = active.filter((a) => localDate(new Date(a.start_at), tz) === today).length;
  const pendingCount = active.filter((a) => a.status === "pending").length;

  const groups = new Map<string, AppointmentRow[]>();
  for (const a of rows) {
    const d = localDate(new Date(a.start_at), tz);
    groups.set(d, [...(groups.get(d) ?? []), a]);
  }
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Today" value={todayCount} hint="Booked and still to come" icon={<CalendarDays className="h-4 w-4" />} />
        <Stat label="Upcoming" value={active.length} hint="Pending and confirmed" />
        <Stat label="Needs confirmation" value={pendingCount} hint={pendingCount ? "Confirm or cancel below" : "All caught up"} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={v === "upcoming" ? base : `${base}?view=${v}`} className={`rounded-full px-3 py-1 ${view === v ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
            {VIEWS[v]}
            {v === "pending" && pendingCount ? <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-amber-950">{pendingCount}</span> : null}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title={view === "upcoming" ? "No upcoming appointments" : `No ${VIEWS[view].toLowerCase()} appointments`} icon={<CalendarDays className="h-5 w-5" />}>
          Bookings made in your chat widget land here and in your email.
        </Empty>
      ) : (
        <div className="grid gap-4">
          {[...groups].map(([date, list]) => (
            <section key={date}>
              <h3 className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-zinc-500">
                {date === today ? "Today · " : ""}
                {dayLabel(date)}
              </h3>
              <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-[var(--shadow-card)]">
                {list.map((a) => (
                  <AppointmentItem key={a.id} a={a} botId={botId} tz={tz} org={org} past={a.end_at < nowIso} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function AppointmentItem({ a, botId, tz, org, past }: { a: AppointmentRow; botId: string; tz: string; org: string; past: boolean }) {
  const act = setAppointmentStatus.bind(null, botId);
  const start = time12(localTime(new Date(a.start_at), tz));
  const end = time12(localTime(new Date(a.end_at), tz));
  const Btn = ({ v, children, cls, confirm }: { v: string; children: React.ReactNode; cls: string; confirm?: string }) => (
    <form action={act}>
      <input type="hidden" name="appointmentId" value={a.id} />
      <input type="hidden" name="act" value={v} />
      {confirm ? <ConfirmSubmit message={confirm} className={cls}>{children}</ConfirmSubmit> : <button className={cls}>{children}</button>}
    </form>
  );
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="w-28 flex-none">
        <div className="num text-[15px] font-semibold text-zinc-950">{start}</div>
        <div className="text-[12px] text-zinc-500">to {end}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-zinc-900">{a.customer_name}</span>
          <Badge tone={TONE[a.status]} dot>{LABEL[a.status]}</Badge>
          {a.is_test ? <Badge tone="gray">Test</Badge> : null}
        </div>
        <div className="mt-0.5 text-[13.5px] text-zinc-700">
          {a.service_name}
          <span className="text-zinc-400"> · </span>
          <a className="underline decoration-zinc-300 underline-offset-2" href={`tel:${a.customer_phone}`}>{a.customer_phone}</a>
          {a.customer_email ? <span className="text-zinc-500"> · {a.customer_email}</span> : null}
        </div>
        {a.notes ? <p className="mt-1 text-[13px] text-zinc-600">“{a.notes}”</p> : null}
        {a.cancel_reason ? <p className="mt-1 text-[12.5px] text-zinc-500">Reason: {a.cancel_reason}</p> : null}
        {a.conversation_id ? (
          <Link className="mt-1 inline-block text-[12.5px] text-zinc-500 underline" href={`/app/bots/${botId}/conversations/${a.conversation_id}`}>View chat</Link>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {a.status === "pending" && !past ? <Btn v="confirm" cls={btn.brand}><Check className="h-4 w-4" /> Confirm</Btn> : null}
        {(a.status === "confirmed" || a.status === "pending") && past ? <Btn v="complete" cls={btn.secondary}><CheckCheck className="h-4 w-4" /> Mark done</Btn> : null}
        {a.status !== "cancelled" && a.status !== "completed" ? (
          <a className={btn.secondary} href={whatsappLink(a.customer_phone, `Hi ${a.customer_name}, this is ${org} about your appointment on ${dayLabel(localDate(new Date(a.start_at), tz))} at ${start}.`)} target="_blank" rel="noreferrer">
            <Phone className="h-4 w-4" /> WhatsApp
          </a>
        ) : null}
        {(a.status === "pending" || a.status === "confirmed") && !past ? <Btn v="cancel" cls={btn.danger} confirm={`Cancel ${a.customer_name}'s appointment at ${start}?${a.customer_email ? " They'll get an email." : ""}`}><X className="h-4 w-4" /> Cancel</Btn> : null}
      </div>
    </div>
  );
}

export function SettingsView({ botId, settings, canBook, exists, overrides }: { botId: string; settings: BookingSettingsRow; canBook: boolean; exists: boolean; overrides: DateOverrideRow[] }) {
  const del = deleteDateOverride.bind(null, botId);
  return (
    <div className="grid gap-4">
      <BookingSettingsForm botId={botId} settings={settings} canBook={canBook} planName={bookingPlan().name} exists={exists} />
      <Card title="Holidays and special days" sub="Close a date, or set different hours just for that day. This beats the weekly hours.">
        <OverrideForm botId={botId} />
        {overrides.length ? (
          <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {overrides.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-3 py-2 text-[13.5px]">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                <span className="font-medium text-zinc-900 sm:w-40 sm:flex-none">{dayLabel(o.date)}</span>
                <span className="min-w-0 text-zinc-600">
                  {o.closed ? <Badge tone="red">Closed</Badge> : o.hours.map(([s, e]) => `${time12(s)}–${time12(e)}`).join(", ")}
                  {o.note ? <span className="ml-2 text-zinc-500">{o.note}</span> : null}
                </span>
                </span>
                <form action={del}>
                  <input type="hidden" name="overrideId" value={o.id} />
                  <button className={btn.ghost} aria-label={`Remove ${o.date}`}><Trash2 className="h-4 w-4" /></button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}

export function ServicesView({ botId, settings, services }: { botId: string; settings: BookingSettingsRow; services: BookingServiceRow[] }) {
  const del = deleteBookingService.bind(null, botId);
  return (
    <div className="grid gap-4">
      <Card title="Add a service" sub={`What can people book? Each has its own length. With no services, visitors book a ${settings.slot_interval_minutes}-minute “Appointment”.`}>
        <ServiceForm botId={botId} />
      </Card>
      {services.length ? (
        <Card title={`Your services (${services.length})`}>
          <div className="grid gap-5 divide-y divide-zinc-100">
            {services.map((s) => (
              <div key={s.id} className="grid gap-2 pt-5 first:pt-0">
                <ServiceForm botId={botId} service={s} />
                <form action={del} className="justify-self-end">
                  <input type="hidden" name="serviceId" value={s.id} />
                  <ConfirmSubmit message={`Remove “${s.name}”? Booked appointments keep their details.`} className={btn.ghost}><Trash2 className="h-4 w-4" /> Remove</ConfirmSubmit>
                </form>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export function BookingNotice({ notMigrated, canBook, enabled, base }: { notMigrated: boolean; canBook: boolean; enabled: boolean; base: string }) {
  if (notMigrated) return <Notice tone="amber">Booking needs a one-time database update (0016) before it can be used. Your other features are not affected.</Notice>;
  if (!canBook)
    return (
      <Notice tone="amber">
        Let customers book appointments from your chat: live free times, your hours and breaks, and an email for every booking. Available on {bookingPlan().name} ({fmtInr(bookingPlan().priceInr)}/month) and above.{" "}
        <Link className="font-medium underline" href="/app/billing">Upgrade</Link>
      </Notice>
    );
  if (!enabled)
    return (
      <Notice tone="blue">
        Booking is off. Set your hours and services, then switch it on under <Link className="font-medium underline" href={`${base}?tab=settings`}>Availability</Link>.
      </Notice>
    );
  return null;
}

export function BookingTabs({ base, tab }: { base: string; tab: string }) {
  return (
    <div className="-mt-1 flex gap-1 overflow-x-auto border-b border-zinc-200">
      <TabLink href={base} active={tab === "appointments"}>Appointments</TabLink>
      <TabLink href={`${base}?tab=settings`} active={tab === "settings"}>Availability</TabLink>
      <TabLink href={`${base}?tab=services`} active={tab === "services"}>Services</TabLink>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Copy } from "lucide-react";
import type { ActionState } from "@/app/app/actions";
import { saveBookingService, saveBookingSettings, saveDateOverride } from "@/app/app/booking-actions";
import { SubmitButton, useFormAction } from "@/components/client";
import { btn, Card, Field, inputClass, Notice } from "@/components/ui";
import type { BookingServiceRow, BookingSettingsRow } from "@/lib/booking/types";
import { time12, type TimeRange, type WeeklyHours } from "@/lib/booking/slots";
import { DAYS, type Day } from "@/lib/hours";

const DAY_LABEL: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const selectClass = inputClass;
const timeClass = `${inputClass.replace("block w-full", "block w-full min-w-0 px-1.5 sm:w-[8.5rem] sm:px-3")} max-sm:text-[13.5px] max-sm:[&::-webkit-calendar-picker-indicator]:hidden`;

function Toast({ state }: { state: ActionState }) {
  const [shown, setShown] = useState<ActionState>(null);
  useEffect(() => {
    if (!state) return;
    setShown(state);
    const id = window.setTimeout(() => setShown(null), state.error ? 8000 : 2800);
    return () => window.clearTimeout(id);
  }, [state]);
  if (!shown || (!shown.error && !shown.message)) return null;
  return (
    <div role={shown.error ? "alert" : "status"} className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg ${shown.error ? "bg-red-700" : "bg-zinc-950"}`}>
      {shown.error ?? shown.message}
    </div>
  );
}

function Switch({ name, checked, onChange, label, disabled }: { name: string; checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`inline-flex select-none items-center gap-2.5 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <input type="checkbox" name={name} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="relative h-6 w-11 flex-none rounded-full bg-zinc-300 transition peer-checked:bg-emerald-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/20 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
      <span className="text-[14px] font-medium text-zinc-900">{label}</span>
    </label>
  );
}

/** Weekly hours: each day open/closed, with one or more time ranges (gaps between them are breaks). */
export function WeeklyHoursEditor({ value, onChange }: { value: WeeklyHours; onChange: (v: WeeklyHours) => void }) {
  const set = (d: Day, ranges: TimeRange[]) => onChange({ ...value, [d]: ranges });
  return (
    <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
      {DAYS.map((d) => {
        const ranges = value[d] ?? [];
        const open = ranges.length > 0;
        return (
          <div key={d} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start">
            <div className="flex w-36 flex-none items-center gap-2 pt-1.5">
              <input
                id={`open-${d}`}
                type="checkbox"
                checked={open}
                onChange={(e) => set(d, e.target.checked ? [["10:00", "13:00"], ["14:00", "19:00"]] : [])}
                className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
              />
              <label htmlFor={`open-${d}`} className="text-[13.5px] font-medium text-zinc-900">{DAY_LABEL[d]}</label>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {!open ? <p className="pt-1.5 text-[13.5px] text-zinc-400">Closed</p> : null}
              {ranges.map(([a, b], i) => (
                <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                  <input type="time" aria-label={`${DAY_LABEL[d]} opens`} value={a} step={300} onChange={(e) => set(d, ranges.map((r, k) => (k === i ? [e.target.value, r[1]] : r)))} className={timeClass} />
                  <span className="text-zinc-400">–</span>
                  <input type="time" aria-label={`${DAY_LABEL[d]} closes`} value={b} step={300} onChange={(e) => set(d, ranges.map((r, k) => (k === i ? [r[0], e.target.value] : r)))} className={timeClass} />
                  </span>
                  <button type="button" onClick={() => set(d, ranges.filter((_, k) => k !== i))} className={btn.ghost} aria-label={`Remove ${a}–${b} on ${DAY_LABEL[d]}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                  {i > 0 && ranges[i - 1]?.[1] && a ? <span className="basis-full text-[12px] text-zinc-500 sm:basis-auto">Break {time12(ranges[i - 1]![1])}–{time12(a)}</span> : null}
                </div>
              ))}
            </div>
            {open ? (
              <div className="flex flex-none gap-1 sm:pt-0.5">
                <button
                  type="button"
                  className={btn.ghost}
                  onClick={() => {
                    const last = ranges[ranges.length - 1]?.[1] ?? "16:00";
                    const h = Math.min(22, Number(last.slice(0, 2)) + 1);
                    set(d, [...ranges, [`${String(h).padStart(2, "0")}:00`, `${String(Math.min(23, h + 2)).padStart(2, "0")}:00`]]);
                  }}
                >
                  <Plus className="h-4 w-4" /> Hours
                </button>
                {d === "mon" ? (
                  <button type="button" className={btn.ghost} onClick={() => onChange(Object.fromEntries(DAYS.map((x) => [x, ["sat", "sun"].includes(x) ? value[x] ?? [] : ranges])) as WeeklyHours)} title="Copy Monday's hours to Tuesday–Friday">
                    <Copy className="h-4 w-4" /> Weekdays
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function BookingSettingsForm({ botId, settings, canBook, planName, exists }: { botId: string; settings: BookingSettingsRow; canBook: boolean; planName: string; exists: boolean }) {
  const [state, action, pending] = useFormAction<ActionState>(saveBookingSettings.bind(null, botId), null);
  const [enabled, setEnabled] = useState(settings.enabled && canBook);
  const [hours, setHours] = useState<WeeklyHours>(settings.weekly_hours);
  const [notify, setNotify] = useState(settings.notify_customer);
  return (
    <form onSubmit={action} className="grid gap-4">
      <Toast state={state} />
      <input type="hidden" name="weekly_hours" value={JSON.stringify(hours)} />
      <input type="hidden" name="timezone" value={settings.timezone} />
      <Card title="Online booking" sub="When it's on, visitors see “Book an appointment” in your chat widget and the assistant offers real free times.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Switch name="enabled" checked={enabled} onChange={setEnabled} disabled={!canBook} label={enabled ? "Booking is on" : "Booking is off"} />
          {!exists ? <span className="text-[12.5px] text-zinc-500">Not set up yet: defaults shown below.</span> : null}
        </div>
        {!canBook ? (
          <div className="mt-3">
            <Notice tone="amber">
              Appointment booking is part of the {planName} plan and above. <a className="font-medium underline" href="/app/billing">Upgrade from Billing</a> to switch it on. You can set your hours now.
            </Notice>
          </div>
        ) : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Button text" htmlFor="title" hint="Shown on the chat home screen.">
            <input id="title" name="title" defaultValue={settings.title} required minLength={2} maxLength={60} className={inputClass} />
          </Field>
          <Field label="New bookings" htmlFor="confirmation_mode" hint="Manual: the time is held and you confirm it here.">
            <select id="confirmation_mode" name="confirmation_mode" defaultValue={settings.confirmation_mode} className={selectClass}>
              <option value="auto">Confirm automatically</option>
              <option value="manual">I confirm each one</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Weekly hours" sub={`Times are in ${settings.timezone}. Add a second range for a lunch break or evening session.`}>
        <WeeklyHoursEditor value={hours} onChange={setHours} />
      </Card>

      <Card title="Slots and limits">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Start times every" htmlFor="slot_interval_minutes" hint="e.g. 10:00, 10:30, 11:00">
            <select id="slot_interval_minutes" name="slot_interval_minutes" defaultValue={String(settings.slot_interval_minutes)} className={selectClass}>
              {[10, 15, 20, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>
              ))}
            </select>
          </Field>
          <Field label="Gap between appointments" htmlFor="buffer_minutes" hint="Cleaning, notes or travel time.">
            <select id="buffer_minutes" name="buffer_minutes" defaultValue={String(settings.buffer_minutes)} className={selectClass}>
              {[0, 5, 10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>{m ? `${m} minutes` : "No gap"}</option>
              ))}
            </select>
          </Field>
          <Field label="People at the same time" htmlFor="capacity_per_slot" hint="Doctors, chairs or seats in a class.">
            <input id="capacity_per_slot" name="capacity_per_slot" type="number" min={1} max={50} defaultValue={settings.capacity_per_slot} className={inputClass} />
          </Field>
          <Field label="Minimum notice" htmlFor="min_notice_minutes" hint="No bookings sooner than this.">
            <select id="min_notice_minutes" name="min_notice_minutes" defaultValue={String(settings.min_notice_minutes)} className={selectClass}>
              {[[0, "None"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [240, "4 hours"], [720, "12 hours"], [1440, "1 day"], [2880, "2 days"]].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Book up to" htmlFor="max_days_ahead" hint="Days ahead the calendar is open.">
            <select id="max_days_ahead" name="max_days_ahead" defaultValue={String(settings.max_days_ahead)} className={selectClass}>
              {[7, 14, 21, 30, 60, 90].map((d) => (
                <option key={d} value={d}>{d} days ahead</option>
              ))}
            </select>
          </Field>
          <Field label="Most bookings in a day" htmlFor="daily_limit" hint="Leave empty for no limit.">
            <input id="daily_limit" name="daily_limit" type="number" min={1} max={1000} defaultValue={settings.daily_limit ?? ""} placeholder="No limit" className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card title="Booking form and messages">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email on the form" htmlFor="collect_email" hint="Name and phone are always asked.">
            <select id="collect_email" name="collect_email" defaultValue={settings.collect_email} className={selectClass}>
              <option value="optional">Optional</option>
              <option value="required">Required</option>
              <option value="off">Don't ask</option>
            </select>
          </Field>
          <div className="flex items-end pb-2">
            <Switch name="notify_customer" checked={notify} onChange={setNotify} label="Email customers their confirmation" />
          </div>
          <Field label="After booking, tell the customer" htmlFor="instructions" hint="e.g. Please arrive 10 minutes early and bring old reports.">
            <textarea id="instructions" name="instructions" rows={3} maxLength={500} defaultValue={settings.instructions ?? ""} className={inputClass} />
          </Field>
          <Field label="Cancellation policy" htmlFor="cancellation_policy" hint="Shown under the booking button.">
            <textarea id="cancellation_policy" name="cancellation_policy" rows={3} maxLength={300} defaultValue={settings.cancellation_policy ?? ""} placeholder="To change or cancel, call us at least 2 hours before." className={inputClass} />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <SubmitButton pending={pending}>Save booking settings</SubmitButton>
          {state?.error ? <span className="text-[13px] text-red-700">{state.error}</span> : null}
        </div>
      </Card>
    </form>
  );
}

export function ServiceForm({ botId, service, onDone }: { botId: string; service?: BookingServiceRow; onDone?: () => void }) {
  const [state, action, pending] = useFormAction<ActionState>(saveBookingService.bind(null, botId), null);
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);
  return (
    <form onSubmit={action} className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_8rem_8rem_auto] sm:items-end">
      <Toast state={state} />
      {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}
      <Field label="Service" htmlFor={`sn-${service?.id ?? "new"}`}>
        <input id={`sn-${service?.id ?? "new"}`} name="name" required minLength={2} maxLength={80} defaultValue={service?.name ?? ""} placeholder="e.g. General consultation" className={inputClass} />
      </Field>
      <Field label="Minutes" htmlFor={`sd-${service?.id ?? "new"}`}>
        <input id={`sd-${service?.id ?? "new"}`} name="duration_minutes" type="number" min={5} max={480} step={5} required defaultValue={service?.duration_minutes ?? 30} className={inputClass} />
      </Field>
      <Field label="Price ₹" htmlFor={`sp-${service?.id ?? "new"}`}>
        <input id={`sp-${service?.id ?? "new"}`} name="price_inr" type="number" min={0} defaultValue={service?.price_inr ?? ""} placeholder="Optional" className={inputClass} />
      </Field>
      <SubmitButton pending={pending} className={service ? btn.secondary : btn.primary} pendingText="Saving…">{service ? "Save" : "Add service"}</SubmitButton>
      <div className="sm:col-span-4">
        <input name="description" maxLength={300} defaultValue={service?.description ?? ""} placeholder="Short description (optional), e.g. First visit, includes a basic check-up" aria-label="Description" className={inputClass} />
      </div>
    </form>
  );
}

export function OverrideForm({ botId }: { botId: string }) {
  const [state, action, pending] = useFormAction<ActionState>(saveDateOverride.bind(null, botId), null);
  const [kind, setKind] = useState<"closed" | "hours">("closed");
  const [ranges, setRanges] = useState<TimeRange[]>([["10:00", "13:00"]]);
  return (
    <form onSubmit={action} className="grid gap-3">
      <Toast state={state} />
      <input type="hidden" name="hours" value={JSON.stringify(ranges)} />
      <div className="grid gap-3 sm:grid-cols-[10rem_12rem_minmax(0,1fr)] sm:items-end">
        <Field label="Date" htmlFor="ov-date">
          <input id="ov-date" name="date" type="date" required className={inputClass} />
        </Field>
        <Field label="That day" htmlFor="ov-kind">
          <select id="ov-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "closed" | "hours")} className={selectClass}>
            <option value="closed">Closed (holiday, leave)</option>
            <option value="hours">Special hours</option>
          </select>
        </Field>
        <Field label="Note (optional)" htmlFor="ov-note">
          <input id="ov-note" name="note" maxLength={120} placeholder="e.g. Pongal holiday" className={inputClass} />
        </Field>
      </div>
      {kind === "hours" ? (
        <div className="flex flex-col gap-2">
          {ranges.map(([a, b], i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="time" aria-label="Opens" value={a} onChange={(e) => setRanges(ranges.map((r, k) => (k === i ? [e.target.value, r[1]] : r)))} className={timeClass} />
              <span className="text-zinc-400">–</span>
              <input type="time" aria-label="Closes" value={b} onChange={(e) => setRanges(ranges.map((r, k) => (k === i ? [r[0], e.target.value] : r)))} className={timeClass} />
              {ranges.length > 1 ? (
                <button type="button" className={btn.ghost} onClick={() => setRanges(ranges.filter((_, k) => k !== i))} aria-label="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
          <button type="button" className={`${btn.ghost} w-fit`} onClick={() => setRanges([...ranges, ["17:00", "19:00"]])}>
            <Plus className="h-4 w-4" /> Hours
          </button>
        </div>
      ) : null}
      <div>
        <SubmitButton pending={pending} className={btn.secondary}>{kind === "closed" ? "Mark closed" : "Save special hours"}</SubmitButton>
      </div>
    </form>
  );
}

/** A submit button that asks first (cancel an appointment, remove a service). */
export function ConfirmSubmit({ message, className, children, label }: { message: string; className: string; children: React.ReactNode; label?: string }) {
  return (
    <button
      className={className}
      aria-label={label}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

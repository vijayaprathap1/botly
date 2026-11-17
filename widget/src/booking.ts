/**
 * Appointment booking inside the widget: one card that walks through
 *   service → day and time (real free slots from /api/widget/booking) → details → booked.
 * Shown only when the business switched booking on (config.booking). Everything the visitor
 * sees comes from the server's availability; the server re-checks the time when booking.
 */
import type { Api, BookingService, BookingSlots } from "./api";
import { h, icon, svg } from "./dom";
import { isValidEmail, normalizePhone } from "../../lib/validation/phone";
import { time12 } from "../../lib/booking/slots";

export const ICON_CAL = svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>');
const ICON_TICK = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"');
const ICON_NEXT = svg('<path d="M9 6l6 6-6 6"/>');
const ICON_BACK = svg('<path d="M15 6l-6 6 6 6"/>');

type Identity = { name?: string; phone?: string; email?: string };
export type BookingHost = {
  api: Api;
  business: string;
  identity: () => Identity;
  visitorId: () => string;
  conversationId: () => string | null;
  scroll: () => void;
  talkToPerson: () => void;
  maskPhone: (display: string) => string;
};

/** "18", "Tue", "Nov" for a YYYY-MM-DD date (dates are calendar days, so read them as UTC). */
export function dayParts(date: string): { d: string; wd: string; mon: string } {
  const at = new Date(date + "T00:00:00Z");
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...o }).format(at);
  return { d: String(at.getUTCDate()), wd: f({ weekday: "short" }), mon: f({ month: "short" }) };
}

export function durationText(min: number): string {
  if (min < 60) return `${min} min`;
  const hrs = Math.floor(min / 60);
  const rest = min % 60;
  return `${hrs} hr${rest ? ` ${rest} min` : ""}`;
}

export const priceText = (p: number | null) => (p == null ? "" : p === 0 ? "Free" : `₹${p.toLocaleString("en-IN")}`);

/** Morning (before 12), Afternoon (12–5 pm), Evening (5 pm on). Empty groups are dropped. */
export function groupSlots<T extends { t: string }>(slots: T[]): { label: string; items: T[] }[] {
  const groups = [
    { label: "Morning", items: [] as T[] },
    { label: "Afternoon", items: [] as T[] },
    { label: "Evening", items: [] as T[] },
  ];
  for (const s of slots) groups[s.t < "12:00" ? 0 : s.t < "17:00" ? 1 : 2]!.items.push(s);
  return groups.filter((g) => g.items.length);
}

type Step = "loading" | "service" | "time" | "details" | "done" | "error";

export class BookingFlow {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private sub: HTMLElement;
  private bar: HTMLElement;
  private data: BookingSlots | null = null;
  private service: BookingService | null = null;
  private date: string | null = null;
  private slot: { start: string; t: string } | null = null;
  private req = 0;
  private wantService: string | undefined;
  private wantDate: string | undefined;
  private finished = false;

  constructor(private host: BookingHost, private title: string, opts: { service?: string; date?: string } = {}) {
    this.wantService = opts.service;
    this.wantDate = opts.date;
    this.sub = h("p", { class: "note", "aria-live": "polite" });
    this.bar = h("div", { class: "bk-steps", "aria-hidden": "true" }, h("i"), h("i"), h("i"));
    this.body = h("div", { class: "bk-body" });
    this.el = h(
      "div",
      { class: "card bk", role: "group", "aria-label": title },
      h("div", { class: "bk-head" }, h("span", { class: "bk-ic" }, icon(ICON_CAL)), h("div", { class: "bk-ht" }, h("h3", { text: title }), this.sub)),
      this.bar,
      this.body,
    );
    void this.load();
  }

  get done() {
    return this.finished;
  }

  private setStep(step: Step, sub: string) {
    this.el.dataset.step = step;
    this.sub.textContent = sub;
    const n = step === "service" ? 1 : step === "time" ? 2 : step === "details" ? 3 : step === "done" ? 4 : 0;
    this.bar.querySelectorAll("i").forEach((i, k) => i.classList.toggle("on", k < n));
    this.bar.hidden = step === "done" || step === "error";
  }

  private async load(date?: string | null) {
    const id = ++this.req;
    if (!this.data) {
      this.setStep("loading", "Loading free times…");
      this.body.replaceChildren(this.skeleton());
    }
    const r = await this.host.api.bookingSlots(this.service?.id ?? this.wantService ?? null, date ?? this.wantDate ?? null);
    if (id !== this.req) return;
    if (!r.ok) return this.fail((r as { error?: string }).error || "Booking isn't available right now.");
    const first = !this.data;
    this.data = r;
    this.service = r.services.find((s) => s.id === r.service) ?? r.services[0] ?? null;
    this.date = r.date;
    if (first && r.services.length > 1 && !this.wantService) return this.showServices();
    this.wantService = this.service?.id;
    this.wantDate = undefined;
    this.showTime();
  }

  private skeleton() {
    const s = h("div", { class: "bk-skel", "aria-hidden": "true" });
    for (let i = 0; i < 6; i++) s.append(h("i"));
    return s;
  }

  private fail(msg: string) {
    this.setStep("error", msg);
    const retry = h("button", { class: "btn ghost", type: "button", text: "Try again" });
    retry.addEventListener("click", () => {
      this.data = null;
      void this.load();
    });
    const person = h("button", { class: "link", type: "button", text: "Or talk to a person" });
    person.addEventListener("click", () => this.host.talkToPerson());
    this.body.replaceChildren(retry, person);
    this.host.scroll();
  }

  private showServices() {
    const d = this.data!;
    this.setStep("service", "Choose a service");
    const list = h("div", { class: "bk-svcs" });
    for (const s of d.services) {
      const meta = [durationText(s.duration), priceText(s.price)].filter(Boolean).join(" · ");
      const b = h(
        "button",
        { class: "bk-svc", type: "button" },
        h("span", { class: "bk-svc-t" }, h("b", { text: s.name }), h("small", { text: meta }), s.description ? h("small", { class: "bk-desc", text: s.description }) : null),
        icon(ICON_NEXT),
      );
      b.addEventListener("click", () => {
        this.service = s;
        this.wantService = s.id;
        this.slot = null;
        this.data = { ...d, slots: [], days: [] };
        this.setStep("loading", "Loading free times…");
        this.body.replaceChildren(this.skeleton());
        void this.load(null);
      });
      list.append(b);
    }
    this.body.replaceChildren(list);
    this.host.scroll();
  }

  private serviceLine(withChange: boolean) {
    const s = this.service!;
    const meta = [durationText(s.duration), priceText(s.price)].filter(Boolean).join(" · ");
    const line = h("div", { class: "bk-pick" }, h("span", {}, h("b", { text: s.name }), h("small", { text: meta })));
    if (withChange && (this.data?.services.length ?? 0) > 1) {
      const c = h("button", { class: "link", type: "button", text: "Change" });
      c.addEventListener("click", () => this.showServices());
      line.append(c);
    }
    return line;
  }

  private showTime() {
    const d = this.data!;
    this.setStep("time", "Pick a day and time");
    const open = d.days.filter((x) => x.n > 0);
    if (!open.length) {
      const person = h("button", { class: "btn ghost", type: "button", text: `Contact ${this.host.business}` });
      person.addEventListener("click", () => this.host.talkToPerson());
      this.body.replaceChildren(this.serviceLine(true), h("p", { class: "bk-empty", text: "No free times in the coming days. The team can help you find one." }), person);
      return this.host.scroll();
    }
    const strip = h("div", { class: "bk-days", role: "group", "aria-label": "Days" });
    for (const day of d.days.slice(0, 62)) {
      const p = dayParts(day.date);
      const sel = day.date === this.date;
      const b = h(
        "button",
        { class: sel ? "bk-day on" : "bk-day", type: "button", "aria-pressed": String(sel), "aria-label": `${p.wd} ${p.d} ${p.mon}${day.n ? `, ${day.n} free` : ", full"}`, disabled: day.n === 0 },
        h("small", { text: p.wd }),
        h("b", { text: p.d }),
        h("small", { text: p.mon }),
      );
      b.addEventListener("click", () => {
        if (day.date === this.date) return;
        this.date = day.date;
        strip.querySelectorAll(".bk-day").forEach((x) => {
          x.classList.toggle("on", x === b);
          x.setAttribute("aria-pressed", String(x === b));
        });
        slots.replaceChildren(this.skeleton());
        void this.loadDay(day.date, slots);
      });
      strip.append(b);
    }
    const slots = h("div", { class: "bk-times" });
    this.renderSlots(slots, d.slots);
    this.body.replaceChildren(this.serviceLine(true), strip, slots);
    // Keep the chosen day in view in the strip.
    window.setTimeout(() => strip.querySelector<HTMLElement>(".bk-day.on")?.scrollIntoView?.({ block: "nearest", inline: "center" }), 0);
    this.host.scroll();
  }

  private async loadDay(date: string, target: HTMLElement) {
    const id = ++this.req;
    const r = await this.host.api.bookingSlots(this.service?.id ?? null, date);
    if (id !== this.req) return;
    if (!r.ok) {
      target.replaceChildren(h("p", { class: "err", text: (r as { error?: string }).error || "Couldn't load times." }));
      return;
    }
    this.data = { ...r, days: r.days.length ? r.days : this.data!.days };
    this.renderSlots(target, r.date === date ? r.slots : []);
  }

  private renderSlots(target: HTMLElement, slots: BookingSlots["slots"], notice?: string) {
    const out: Node[] = [];
    if (notice) out.push(h("p", { class: "err", role: "alert", text: notice }));
    if (!slots.length) out.push(h("p", { class: "bk-empty", text: "No free times on this day. Try another day." }));
    for (const g of groupSlots(slots)) {
      const grid = h("div", { class: "bk-grid" });
      for (const [i, s] of g.items.entries()) {
        const b = h("button", { class: "bk-slot", type: "button", text: time12(s.t) });
        b.style.setProperty("--i", String(Math.min(i, 12)));
        b.addEventListener("click", () => {
          this.slot = s;
          this.showDetails();
        });
        grid.append(b);
      }
      out.push(h("p", { class: "bk-g", text: g.label }), grid);
    }
    target.replaceChildren(...out);
    this.host.scroll();
  }

  private whenText() {
    const p = dayParts(this.date!);
    return `${p.wd}, ${p.d} ${p.mon} · ${time12(this.slot!.t)}`;
  }

  private showDetails(error?: string) {
    const d = this.data!;
    const manual = d.confirmation === "manual";
    this.setStep("details", "Your details");
    const id = this.host.identity();
    const uid = Math.random().toString(36).slice(2, 7);
    const lbl = (k: string, text: string, optional = false) => h("label", { for: `${k}-${uid}` }, text, optional ? h("span", { text: " (optional)" }) : null);
    const name = h("input", { id: `bn-${uid}`, autocomplete: "name", maxlength: "80", value: id.name ?? "" });
    const phone = h("input", { id: `bp-${uid}`, type: "tel", inputmode: "tel", autocomplete: "tel", maxlength: "20", placeholder: "10-digit mobile number", value: id.phone ?? "" });
    const email = d.collectEmail === "off" ? null : h("input", { id: `be-${uid}`, type: "email", autocomplete: "email", maxlength: "200", value: id.email ?? "" });
    const notes = h("textarea", { id: `bt-${uid}`, maxlength: "500", rows: "2", placeholder: "Anything they should know before your visit" });
    const err = h("div", { class: "err", role: "alert", text: error ?? "" });
    const label = manual ? "Request this time" : "Confirm booking";
    const submit = h("button", { class: "btn", type: "submit", text: label });
    const change = h("button", { class: "link", type: "button" }, icon(ICON_BACK), "Change time");
    change.addEventListener("click", () => this.showTime());
    const summary = h(
      "div",
      { class: "summary bk-sum" },
      h("div", {}, h("span", { text: "Service" }), h("b", { text: this.service!.name })),
      h("div", {}, h("span", { text: "When" }), h("b", { text: this.whenText() })),
    );
    const form = h(
      "form",
      { class: "bk-form", novalidate: true, "aria-label": "Your details" },
      summary,
      change,
      lbl("bn", "Your name"),
      name,
      lbl("bp", "Phone number"),
      phone,
      h("div", { class: "hint", text: "Outside India? Start with + and your country code." }),
      email ? lbl("be", "Email", d.collectEmail !== "required") : null,
      email,
      email && d.collectEmail !== "required" ? h("div", { class: "hint", text: "We'll email you the confirmation." }) : null,
      lbl("bt", "Notes", true),
      notes,
      err,
      submit,
      d.cancellationPolicy ? h("p", { class: "fine", text: d.cancellationPolicy }) : null,
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      if (name.value.trim().length < 2) return void ((err.textContent = "Please enter your name."), name.focus());
      const p = normalizePhone(phone.value);
      if (!p.ok) return void ((err.textContent = p.error), phone.focus());
      const ev = email?.value.trim() ?? "";
      if (email && d.collectEmail === "required" && !ev) return void ((err.textContent = "Please enter your email."), email.focus());
      if (email && ev && !isValidEmail(ev)) return void ((err.textContent = "That email doesn't look right."), email.focus());
      submit.disabled = true;
      submit.textContent = manual ? "Sending…" : "Booking…";
      const r = await this.host.api.book({
        visitorId: this.host.visitorId(),
        conversationId: this.host.conversationId(),
        serviceId: this.service!.id,
        start: this.slot!.start,
        name: name.value.trim(),
        phone: phone.value.trim(),
        email: ev || null,
        notes: notes.value.trim() || null,
        pageUrl: location.href.slice(0, 2000),
        pageTitle: document.title.slice(0, 500),
      });
      if (r.ok) return this.showDone(r.booking, r.instructions, ev);
      submit.disabled = false;
      submit.textContent = label;
      if (r.code === "taken") {
        // Someone else got it first: back to the times, refreshed, with the reason on top.
        this.slot = null;
        this.setStep("time", "Pick a day and time");
        const fresh = await this.host.api.bookingSlots(this.service!.id, this.date);
        if (fresh.ok) this.data = fresh;
        this.showTime();
        const times = this.body.querySelector<HTMLElement>(".bk-times");
        if (times && fresh.ok) this.renderSlots(times, fresh.date === this.date ? fresh.slots : [], r.error);
        return;
      }
      err.textContent = r.error || "Couldn't book. Please try again.";
      const target = r.field === "phone" ? phone : r.field === "email" ? email : r.field === "name" ? name : null;
      target?.focus();
    });
    this.body.replaceChildren(form);
    this.host.scroll();
    window.setTimeout(() => (id.name ? phone : name).focus({ preventScroll: true }), 30);
  }

  private showDone(b: { status: "pending" | "confirmed"; service: string; when: string; phone: string }, instructions: string | null, email: string) {
    this.finished = true;
    const confirmed = b.status === "confirmed";
    this.setStep("done", "");
    this.el.setAttribute("role", "status");
    const note = h("p", { class: "note" });
    if (confirmed) note.append(`${this.host.business} has your appointment.`);
    else note.append(`${this.host.business} will confirm it soon on `, h("span", { style: "white-space:nowrap", text: this.host.maskPhone(b.phone) }), ".");
    if (email) note.append(` A ${confirmed ? "confirmation" : "copy"} is on its way to your email.`);
    this.el.querySelector(".bk-head")!.replaceWith(
      h("div", { class: "ok" }, h("span", { class: "tick" }, icon(ICON_TICK)), h("div", {}, h("h3", { text: confirmed ? "You're booked!" : "Request sent" }), note)),
    );
    const summary = h(
      "div",
      { class: "summary" },
      h("div", {}, h("span", { text: "Service" }), h("b", { text: b.service })),
      h("div", {}, h("span", { text: "When" }), h("b", { text: b.when })),
    );
    this.body.replaceChildren(summary);
    if (instructions) this.body.append(h("p", { class: "fine", text: instructions }));
    this.host.scroll();
  }
}

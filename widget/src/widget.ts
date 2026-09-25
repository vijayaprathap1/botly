import { Api, type WidgetConfig } from "./api";
import { readableTextOn, safeColor } from "./color";
import { parseMarkdownLite, renderBlocks } from "./markdown";
import { getJSON, randomId, setJSON } from "./storage";
import { CSS } from "./styles";
import { normalizePhone, isValidEmail } from "../../lib/validation/phone";

type Identity = { name?: string; phone?: string; email?: string };
type Saved = { visitorId: string; conversationId: string | null; at: number; handedOff?: boolean };
type LeadCard = { type: "lead_form"; leadType: string; prefill?: { name?: string; need?: string; phone?: string; email?: string }; error?: string };
type OrderCard = { type: "order_status"; orderNumber: string; status: string; carrier: string | null; trackingUrl: string | null; expectedDate: string | null };
type CallbackCard = { type: "callback_form"; prefill?: { name?: string; phone?: string; date?: string; slot?: string; need?: string }; minDate: string; error?: string };
type Card =
  | LeadCard
  | { type: "lead_saved"; name: string; handoff: boolean }
  | { type: "fallback_contact"; reason: string; contact: WidgetConfig["fallbackContact"] }
  | OrderCard
  | CallbackCard;

const MAX_LEN = 1000;
const DAY = 24 * 60 * 60 * 1000;

const ICON_CHAT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_SEND =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

/** Tiny element helper. Text goes through textContent only. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k === "text") el.textContent = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c != null) el.append(typeof c === "string" ? document.createTextNode(c) : c);
  return el;
}
/** Static, trusted SVG icons from this file only (never model output). */
function icon(svg: string): HTMLElement {
  const s = document.createElement("span");
  s.style.display = "contents";
  s.innerHTML = svg;
  return s;
}

export type WidgetOptions = { base: string; key: string; testToken: string | null; fullscreen: boolean };

export class BotlyWidget {
  private api: Api;
  private cfg!: WidgetConfig;
  private host!: HTMLElement;
  private root!: ShadowRoot;
  private wrap!: HTMLDivElement;
  private launcher!: HTMLButtonElement;
  private panel: HTMLDivElement | null = null;
  private list!: HTMLDivElement;
  private chips!: HTMLDivElement;
  private input!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private counter!: HTMLDivElement;
  private nudgeEl: HTMLElement | null = null;
  private isOpen = false;
  private busy = false;
  private restored = false;
  private hadUserMessage = false;
  private identity: Identity = {};
  private saved: Saved;
  private storeKey: string;
  private abort: AbortController | null = null;
  private prevOverflow: { html: string; body: string } | null = null;
  private media = window.matchMedia("(prefers-color-scheme: dark)");

  constructor(private opts: WidgetOptions) {
    this.api = new Api(opts.base, opts.key, opts.testToken);
    this.storeKey = `botly:${opts.key}${opts.testToken ? ":test" : ""}`;
    const s = getJSON<Saved>(this.storeKey);
    this.saved = s && s.visitorId ? s : { visitorId: randomId(), conversationId: null, at: Date.now() };
    if (Date.now() - this.saved.at > DAY) this.saved.conversationId = null;
    this.persist();
  }

  // ─── lifecycle ─────────────────────────────────────────────────────────────
  async init(): Promise<boolean> {
    const cacheKey = `${this.storeKey}:cfg`;
    const cached = this.opts.testToken ? null : getJSON<{ at: number; cfg: WidgetConfig }>(cacheKey);
    let cfg = cached && Date.now() - cached.at < 5 * 60 * 1000 ? cached.cfg : null;
    if (!cfg) {
      try {
        cfg = await this.api.config();
      } catch {
        cfg = null;
      }
      if (cfg && !this.opts.testToken) setJSON(cacheKey, { at: Date.now(), cfg });
    }
    if (!cfg) return false; // inactive / not allowed: stay completely silent
    this.cfg = cfg;
    this.mount();
    return true;
  }

  private persist() {
    this.saved.at = Date.now();
    setJSON(this.storeKey, this.saved);
  }

  private mount() {
    this.host = document.createElement("div");
    this.host.id = "botly-widget";
    // Inline !important so host resets like `* { all: unset }` can't move or hide it.
    const hs = this.host.style;
    for (const [k, v] of [
      ["all", "initial"],
      ["position", "fixed"],
      ["z-index", "2147483000"],
      ["top", "0"],
      ["left", "0"],
      ["width", "0"],
      ["height", "0"],
      ["display", "block"],
      ["overflow", "visible"],
    ]) hs.setProperty(k!, v!, "important");
    this.root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    this.root.appendChild(style);

    const p = safeColor(this.cfg.primaryColor);
    this.wrap = h("div", { class: `bl ${this.cfg.position === "left" ? "left" : "right"}${this.opts.fullscreen ? " full" : ""}` });
    this.wrap.style.setProperty("--p", p);
    this.wrap.style.setProperty("--on-p", readableTextOn(p));
    this.applyTheme();
    this.media.addEventListener?.("change", () => this.applyTheme());

    this.launcher = h("button", { class: "launcher", type: "button", "aria-label": `Chat with ${this.cfg.assistantName}`, "aria-expanded": "false" }, icon(ICON_CHAT));
    this.launcher.addEventListener("click", () => (this.isOpen ? this.close() : this.open()));
    if (!this.opts.fullscreen) this.wrap.appendChild(this.launcher);

    this.root.appendChild(this.wrap);
    (document.body ?? document.documentElement).appendChild(this.host);

    if (this.opts.fullscreen) this.open();
    else this.scheduleNudge();
  }

  private applyTheme() {
    const t = this.cfg.theme;
    const dark = t === "dark" || (t === "auto" && this.media.matches);
    this.wrap.classList.toggle("dark", dark);
  }

  // ─── nudge ─────────────────────────────────────────────────────────────────
  private scheduleNudge() {
    const text = this.cfg.nudge;
    if (!text || getJSON<boolean>(`${this.storeKey}:nudge`, true) || this.saved.conversationId) return;
    window.setTimeout(() => {
      if (this.isOpen || this.hadUserMessage) return;
      const x = h("button", { class: "x", type: "button", "aria-label": "Dismiss" }, icon(ICON_CLOSE));
      this.nudgeEl = h("div", { class: "nudge", role: "status" }, h("span", { text }), x);
      this.nudgeEl.addEventListener("click", (e) => {
        this.dismissNudge();
        if (!x.contains(e.target as Node)) this.open();
      });
      this.wrap.appendChild(this.nudgeEl);
    }, 8000);
  }
  private dismissNudge() {
    setJSON(`${this.storeKey}:nudge`, true, true);
    this.nudgeEl?.remove();
    this.nudgeEl = null;
  }

  // ─── open / close ──────────────────────────────────────────────────────────
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.dismissNudge();
    if (!this.panel) this.buildPanel();
    this.panel!.hidden = false;
    this.wrap.classList.add("open");
    this.launcher.setAttribute("aria-expanded", "true");
    this.launcher.setAttribute("aria-label", "Close chat");
    this.lockScroll(true);
    this.fitViewport();
    if (!this.restored) void this.restore();
    window.setTimeout(() => this.input.focus({ preventScroll: true }), 30);
  }

  close() {
    if (!this.isOpen || this.opts.fullscreen) return;
    this.isOpen = false;
    this.panel!.hidden = true;
    this.wrap.classList.remove("open");
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.setAttribute("aria-label", `Chat with ${this.cfg.assistantName}`);
    this.lockScroll(false);
    this.launcher.focus();
  }

  private isMobile() {
    return window.matchMedia("(max-width: 640px)").matches;
  }

  /** Stop the page behind the bottom sheet from scrolling on phones. */
  private lockScroll(lock: boolean) {
    const html = document.documentElement;
    const body = document.body;
    if (lock && (this.isMobile() || this.opts.fullscreen) && !this.prevOverflow) {
      this.prevOverflow = { html: html.style.overflow, body: body?.style.overflow ?? "" };
      html.style.overflow = "hidden";
      if (body) body.style.overflow = "hidden";
    } else if (!lock && this.prevOverflow) {
      html.style.overflow = this.prevOverflow.html;
      if (body) body.style.overflow = this.prevOverflow.body;
      this.prevOverflow = null;
    }
  }

  /** Keep the composer above the on-screen keyboard (visualViewport shrinks when it opens). */
  private fitViewport = () => {
    const vv = window.visualViewport;
    if (!vv || !this.panel) return;
    this.wrap.style.setProperty("--vh", `${Math.round(vv.height)}px`);
    if (this.isMobile()) this.panel.style.transform = vv.offsetTop ? `translateY(${vv.offsetTop}px)` : "";
    else this.panel.style.transform = "";
  };

  // ─── panel ─────────────────────────────────────────────────────────────────
  private buildPanel() {
    const c = this.cfg;
    const avatar = h("div", { class: "avatar", "aria-hidden": "true" });
    if (c.avatarUrl && /^https:\/\//.test(c.avatarUrl)) avatar.append(h("img", { src: c.avatarUrl, alt: "" }));
    else avatar.textContent = (c.assistantName || "A").trim().charAt(0).toUpperCase();

    const closeBtn = h("button", { class: "close", type: "button", "aria-label": "Close chat" }, icon(ICON_CLOSE));
    closeBtn.addEventListener("click", () => this.close());
    const titleId = "bl-title";
    const head = h(
      "div",
      { class: "head" },
      avatar,
      h(
        "div",
        { class: "who" },
        h("b", { id: titleId, text: `${c.assistantName} · ${c.business}` }),
        h("span", { text: c.isOpen ? "Replies instantly" : "We're offline, I can still help" }),
      ),
      closeBtn,
    );

    this.list = h("div", { class: "msgs", role: "log", "aria-live": "polite", "aria-relevant": "additions", "aria-label": "Conversation" });
    this.chips = h("div", { class: "chips" });

    this.input = h("textarea", { rows: "1", maxlength: String(MAX_LEN), placeholder: "Type your message…", "aria-label": "Message" });
    this.sendBtn = h("button", { class: "send", type: "button", "aria-label": "Send message" }, icon(ICON_SEND));
    this.counter = h("div", { class: "count", "aria-live": "polite" });
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.submit();
      }
    });
    this.input.addEventListener("input", () => this.onInput());
    this.sendBtn.addEventListener("click", () => this.submit());

    const human = h("button", { class: "human", type: "button", text: "Talk to a person" });
    human.addEventListener("click", () => this.talkToPerson());

    const meta = h("div", { class: "meta" });
    if (c.showPoweredBy) meta.append(h("span", { text: "Powered by Botly" }));
    meta.append(h("a", { href: c.privacyUrl, target: "_blank", rel: "noopener noreferrer", text: "Privacy" }));

    const foot = h("div", { class: "foot" }, human, h("div", { class: "composer" }, this.input, this.sendBtn), this.counter, meta);

    this.panel = h("div", { class: "panel", role: "dialog", "aria-modal": this.opts.fullscreen ? "false" : "true", "aria-labelledby": titleId }, head, this.list, this.chips, foot);
    this.panel.addEventListener("keydown", (e) => this.onPanelKey(e));
    this.wrap.appendChild(this.panel);
    window.visualViewport?.addEventListener("resize", this.fitViewport);
    window.visualViewport?.addEventListener("scroll", this.fitViewport);

    if (c.greeting) this.addBot(c.greeting, new Date(), false);
    this.renderChips(c.suggestions);
    if (c.quotaExceeded) this.addCard({ type: "fallback_contact", reason: "quota", contact: c.fallbackContact });
    this.onInput();
  }

  private onPanelKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.key !== "Tab" || this.opts.fullscreen) return;
    const focusables = Array.from(
      this.panel!.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])"),
    ).filter((el) => el.offsetParent !== null || el === this.input);
    if (!focusables.length) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = this.root.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !active)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  private onInput() {
    const el = this.input;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
    const n = el.value.length;
    this.counter.textContent = n > MAX_LEN - 100 ? `${n}/${MAX_LEN}` : "";
    this.sendBtn.disabled = this.busy || !el.value.trim();
  }

  private renderChips(questions: string[]) {
    this.chips.replaceChildren();
    for (const q of questions.slice(0, 4)) {
      const b = h("button", { class: "chip", type: "button", text: q });
      b.addEventListener("click", () => this.send(q));
      this.chips.append(b);
    }
  }

  // ─── messages ──────────────────────────────────────────────────────────────
  private time(d: Date) {
    try {
      return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
    } catch {
      return "";
    }
  }

  private scroll() {
    this.list.scrollTop = this.list.scrollHeight;
  }

  private addUser(text: string, at = new Date()) {
    const bubble = h("div", { class: "bubble", text });
    const row = h("div", { class: "row user" }, bubble, h("div", { class: "time", text: this.time(at) }));
    this.list.append(row);
    this.scroll();
    return row;
  }

  private addBot(text: string, at = new Date(), live = true) {
    const bubble = h("div", { class: "bubble" });
    bubble.append(renderBlocks(parseMarkdownLite(text), document));
    const row = h("div", { class: "row bot" }, bubble, h("div", { class: "time", text: this.time(at) }));
    if (!live) row.setAttribute("aria-live", "off");
    this.list.append(row);
    this.scroll();
    return { row, bubble };
  }

  private addEvent(text: string) {
    this.list.append(h("div", { class: "row event" }, h("div", { class: "bubble", text })));
    this.scroll();
  }

  private addTyping() {
    const row = h("div", { class: "row bot", "aria-label": "Assistant is typing" }, h("div", { class: "bubble typing" }, h("i"), h("i"), h("i")));
    this.list.append(row);
    this.scroll();
    return row;
  }

  // ─── restore ───────────────────────────────────────────────────────────────
  private async restore() {
    this.restored = true;
    const id = this.saved.conversationId;
    if (!id) return;
    try {
      const data = await this.api.history(this.saved.visitorId, id);
      if (!data.messages.length) return;
      for (const m of data.messages) {
        const at = new Date(m.at);
        if (m.role === "user") this.addUser(m.content, at);
        else if (m.role === "assistant") this.addBot(m.content, at, false);
        else this.addEvent(m.content);
      }
      this.hadUserMessage = true;
      this.chips.replaceChildren();
      if (data.status === "handed_off" || data.hasLead) this.saved.handedOff = data.status === "handed_off";
    } catch {
      /* restoring is best-effort */
    }
  }

  // ─── sending ───────────────────────────────────────────────────────────────
  private submit() {
    const text = this.input.value.trim();
    if (!text || this.busy) return;
    this.input.value = "";
    this.onInput();
    void this.send(text);
  }

  async send(text: string, existingRow?: HTMLElement) {
    text = text.slice(0, MAX_LEN).trim();
    if (!text || this.busy) return;
    if (!this.isOpen) this.open();
    this.busy = true;
    this.onInput();
    this.hadUserMessage = true;
    this.chips.replaceChildren();
    const userRow = existingRow ?? this.addUser(text);
    userRow.querySelector(".retry")?.remove();

    const typing = this.addTyping();
    let bot: { row: HTMLElement; bubble: HTMLElement } | null = null;
    let full = "";
    let raf = 0;
    const paint = () => {
      raf = 0;
      if (!bot) return;
      bot.bubble.replaceChildren(renderBlocks(parseMarkdownLite(full), document));
      this.scroll();
    };
    const ensureBot = () => {
      if (!bot) {
        typing.remove();
        bot = this.addBot("", new Date());
      }
      return bot;
    };

    this.abort = new AbortController();
    const timer = window.setTimeout(() => this.abort?.abort(), 45_000);
    let failed = false;
    try {
      await this.api.chat(
        {
          visitorId: this.saved.visitorId,
          conversationId: this.saved.conversationId,
          message: text,
          pageUrl: location.href.slice(0, 2000),
          pageTitle: document.title.slice(0, 500),
          identity: this.identity.name || this.identity.phone || this.identity.email ? this.identity : undefined,
        },
        {
          onEvent: (event, data) => {
            if (event === "meta" && data.conversationId) {
              this.saved.conversationId = data.conversationId;
              this.persist();
            } else if (event === "delta") {
              ensureBot();
              full += data.text;
              if (!raf) raf = requestAnimationFrame(paint);
            } else if (event === "tool_card") {
              typing.remove();
              this.addCard(data as Card);
            } else if (event === "suggestions") {
              this.renderChips(data.questions ?? []);
            } else if (event === "error") {
              typing.remove();
              if (data.code !== "inactive" && data.code !== "llm_error") this.addEvent(data.message ?? "Something went wrong.");
            } else if (event === "done") {
              if (data.conversationId) {
                this.saved.conversationId = data.conversationId;
                this.persist();
              }
            }
            window.dispatchEvent(new CustomEvent("botly:event", { detail: { event, data } }));
          },
        },
        this.abort.signal,
      );
    } catch {
      failed = true;
    } finally {
      window.clearTimeout(timer);
      typing.remove();
      if (raf) cancelAnimationFrame(raf);
      paint();
      this.busy = false;
      this.onInput();
    }
    if (failed && !full) {
      const retry = h("button", { class: "retry", type: "button", text: "Couldn't send. Retry" });
      retry.addEventListener("click", () => void this.send(text, userRow));
      userRow.append(retry);
      this.scroll();
    }
  }

  // ─── cards ─────────────────────────────────────────────────────────────────
  private addCard(card: Card) {
    let el: HTMLElement;
    if (card.type === "lead_form") el = this.leadForm(card);
    else if (card.type === "lead_saved") el = this.sentCard(card.name, card.handoff);
    else if (card.type === "order_status") el = this.orderCard(card);
    else if (card.type === "callback_form") el = this.callbackForm(card);
    else el = this.contactCard(card.contact, card.reason);
    this.list.append(h("div", { class: "row bot" }, el));
    this.scroll();
  }

  private sentCard(name: string, handoff: boolean) {
    return h(
      "div",
      { class: "card ok", role: "status" },
      h("span", { class: "tick", "aria-hidden": "true", text: "✓" }),
      h("div", { text: `Sent to the team. They'll ${handoff ? "get in touch" : "contact you"} soon${name ? `, ${name}` : ""}.` }),
    );
  }

  private orderCard(o: OrderCard) {
    const card = h("div", { class: "card", role: "status" }, h("h4", { text: `Order ${o.orderNumber}` }));
    const row = (label: string, value: Node | string) => card.append(h("div", { class: "kv" }, h("span", { text: label }), typeof value === "string" ? h("b", { text: value }) : value));
    row("Status", o.status);
    if (o.carrier) row("Courier", o.carrier);
    if (o.expectedDate) {
      let d = o.expectedDate;
      try {
        d = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(o.expectedDate + "T12:00:00"));
      } catch {}
      row("Expected", d);
    }
    if (o.trackingUrl && /^https:\/\//.test(o.trackingUrl)) row("Tracking", h("a", { href: o.trackingUrl, target: "_blank", rel: "noopener noreferrer", text: "Track package" }));
    return card;
  }

  private callbackForm(card: CallbackCard) {
    const pre = { ...card.prefill, name: card.prefill?.name ?? this.identity.name, phone: card.prefill?.phone ?? this.identity.phone };
    const uid = Math.random().toString(36).slice(2, 7);
    const lbl = (id: string, text: string) => h("label", { for: `${id}-${uid}`, text });
    const name = h("input", { id: `cn-${uid}`, autocomplete: "name", maxlength: "80", value: pre.name ?? "" });
    const phone = h("input", { id: `cp-${uid}`, type: "tel", inputmode: "tel", autocomplete: "tel", maxlength: "20", placeholder: "10-digit mobile number", value: pre.phone ?? "" });
    const date = h("input", { id: `cd-${uid}`, type: "date", min: card.minDate, value: pre.date ?? card.minDate });
    const slot = h("select", { id: `cs-${uid}` });
    for (const s of ["Morning (10 am – 1 pm)", "Afternoon (1 – 4 pm)", "Evening (4 – 7 pm)"]) slot.append(h("option", { value: s, text: s }));
    if (pre.slot) {
      const match = Array.from(slot.options).find((o) => o.value.toLowerCase().startsWith(pre.slot!.toLowerCase().slice(0, 4)));
      if (match) match.selected = true;
    }
    const need = h("textarea", { id: `cw-${uid}`, maxlength: "300", rows: "2" });
    need.value = pre.need ?? "";
    const err = h("div", { class: "err", role: "alert", text: card.error ?? "" });
    const submit = h("button", { class: "btn", type: "submit", text: "Book callback" });
    const form = h(
      "form",
      { class: "card", novalidate: true, "aria-label": "Book a callback" },
      h("h4", { text: "Book a callback" }),
      lbl("cn", "Your name"), name,
      lbl("cp", "Phone number"), phone,
      lbl("cd", "Date"), date,
      lbl("cs", "Time"), slot,
      lbl("cw", "What is it about? (optional)"), need,
      err, submit,
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      if (name.value.trim().length < 2) return void ((err.textContent = "Please enter your name."), name.focus());
      const p = normalizePhone(phone.value);
      if (!p.ok) return void ((err.textContent = p.error), phone.focus());
      if (!date.value || date.value < card.minDate) return void ((err.textContent = "Please pick today or a later date."), date.focus());
      submit.disabled = true;
      submit.textContent = "Booking…";
      try {
        const r = await this.api.lead({
          visitorId: this.saved.visitorId, conversationId: this.saved.conversationId, name: name.value.trim(), phone: phone.value.trim(),
          need: need.value.trim() || null, type: "callback", preferredDate: date.value, preferredSlot: slot.value,
          pageUrl: location.href.slice(0, 2000), pageTitle: document.title.slice(0, 500),
        });
        if (!r.ok) throw new Error(r.error || "Couldn't book. Please try again.");
        if (r.conversationId) this.saved.conversationId = r.conversationId;
        this.persist();
        form.replaceWith(h("div", { class: "card ok", role: "status" }, h("span", { class: "tick", "aria-hidden": "true", text: "✓" }), h("div", { text: `Callback booked for ${date.value}, ${slot.value}. The team will call you.` })));
        this.scroll();
      } catch (ex) {
        err.textContent = ex instanceof Error && ex.message !== "Failed to fetch" ? ex.message : "Couldn't book. Please try again.";
        submit.disabled = false;
        submit.textContent = "Book callback";
      }
    });
    return form;
  }

  private contactCard(contact: WidgetConfig["fallbackContact"], reason: string) {
    const card = h("div", { class: "card contact" });
    card.append(
      h("h4", {
        text: reason === "quota" || reason === "inactive" ? "Chat is busy right now. You can reach us directly:" : "You can reach us directly:",
      }),
    );
    const line = (label: string, value: string, href: string) =>
      h("div", {}, `${label}: `, h("a", { href, target: href.startsWith("http") ? "_blank" : undefined, rel: "noopener noreferrer", text: value }));
    if (contact.phone) card.append(line("Phone", contact.phone, `tel:${contact.phone.replace(/[^\d+]/g, "")}`));
    if (contact.whatsapp) card.append(line("WhatsApp", contact.whatsapp, `https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`));
    if (contact.email) card.append(line("Email", contact.email, `mailto:${contact.email}`));
    if (!contact.phone && !contact.whatsapp && !contact.email) card.append(h("div", { text: "Please try again a little later." }));
    return card;
  }

  private leadForm(card: LeadCard) {
    const pre = { ...card.prefill, ...this.identity };
    const uid = Math.random().toString(36).slice(2, 7);
    const field = (id: string, label: string, input: HTMLInputElement | HTMLTextAreaElement, hint?: string) =>
      h("div", {}, h("label", { for: `${id}-${uid}`, text: label }), input, hint ? h("div", { class: "hint", text: hint }) : null);
    const name = h("input", { id: `n-${uid}`, name: "name", autocomplete: "name", maxlength: "80", required: true, value: pre.name ?? "" });
    const phone = h("input", {
      id: `p-${uid}`,
      name: "phone",
      type: "tel",
      inputmode: "tel",
      autocomplete: "tel",
      maxlength: "20",
      required: true,
      placeholder: "10-digit mobile number",
      value: pre.phone ?? "",
    });
    const email = h("input", { id: `e-${uid}`, name: "email", type: "email", autocomplete: "email", maxlength: "200", value: pre.email ?? "" });
    const need = h("textarea", { id: `d-${uid}`, name: "need", maxlength: "500", rows: "2" });
    need.value = card.prefill?.need ?? "";
    const err = h("div", { class: "err", role: "alert" });
    if (card.error) err.textContent = card.error;
    const submit = h("button", { class: "btn", type: "submit", text: "Send to the team" });
    const form = h(
      "form",
      { class: "card", novalidate: true, "aria-label": "Contact details" },
      h("h4", { text: card.leadType === "human" ? "Talk to a person" : "Share your details and the team will contact you" }),
      field("n", "Your name", name),
      field("p", "Phone number", phone, "Outside India? Start with + and your country code."),
      field("e", "Email (optional)", email),
      field("d", "What do you need? (optional)", need),
      err,
      submit,
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      if (name.value.trim().length < 2) {
        err.textContent = "Please enter your name.";
        return name.focus();
      }
      const p = normalizePhone(phone.value);
      if (!p.ok) {
        err.textContent = p.error;
        return phone.focus();
      }
      if (email.value.trim() && !isValidEmail(email.value)) {
        err.textContent = "That email doesn't look right.";
        return email.focus();
      }
      submit.disabled = true;
      submit.textContent = "Sending…";
      try {
        const r = await this.api.lead({
          visitorId: this.saved.visitorId,
          conversationId: this.saved.conversationId,
          name: name.value.trim(),
          phone: phone.value.trim(),
          email: email.value.trim() || null,
          need: need.value.trim() || null,
          type: card.leadType || "human",
          pageUrl: location.href.slice(0, 2000),
          pageTitle: document.title.slice(0, 500),
        });
        if (!r.ok) throw new Error(r.error || "Couldn't send. Please try again.");
        if (r.conversationId) this.saved.conversationId = r.conversationId;
        if (card.leadType === "human") this.saved.handedOff = true;
        this.persist();
        form.replaceWith(this.sentCard(name.value.trim(), card.leadType === "human"));
        this.scroll();
      } catch (ex) {
        err.textContent = ex instanceof Error && ex.message !== "Failed to fetch" ? ex.message : "Couldn't send. Please try again.";
        submit.disabled = false;
        submit.textContent = "Send to the team";
      }
    });
    window.setTimeout(() => (pre.name ? phone : name).focus({ preventScroll: true }), 30);
    return form;
  }

  private talkToPerson() {
    if (this.saved.handedOff) {
      this.addEvent("Your details are already with the team. They'll get in touch soon.");
      return;
    }
    this.addCard({ type: "lead_form", leadType: "human", prefill: {} });
  }

  // ─── public API ────────────────────────────────────────────────────────────
  identify(id: Identity) {
    this.identity = {
      name: typeof id?.name === "string" ? id.name.slice(0, 80) : undefined,
      phone: typeof id?.phone === "string" ? id.phone.slice(0, 40) : undefined,
      email: typeof id?.email === "string" ? id.email.slice(0, 200) : undefined,
    };
  }
}

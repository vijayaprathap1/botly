import { Api, type WidgetConfig } from "./api";
import { themeVars } from "./color";
import { FontLoader } from "./fonts";
import { parseMarkdownLite, renderBlocks } from "./markdown";
import { getJSON, randomId, setJSON } from "./storage";
import { CSS } from "./styles";
import { normalizePhone, isValidEmail } from "../../lib/validation/phone";

type Identity = { name?: string; phone?: string; email?: string };
type Saved = { visitorId: string; conversationId: string | null; at: number; handedOff?: boolean };
type LeadCard = { type: "lead_form"; leadType: string; prefill?: { name?: string; need?: string; phone?: string; email?: string }; error?: string };
type OrderCard = { type: "order_status"; orderNumber: string; status: string; carrier: string | null; trackingUrl: string | null; expectedDate: string | null };
type CallbackCard = { type: "callback_form"; prefill?: { name?: string; phone?: string; date?: string; slot?: string; need?: string }; minDate: string; error?: string };
type Contact = WidgetConfig["fallbackContact"];
type Card =
  | LeadCard
  | { type: "lead_saved"; name: string; handoff: boolean }
  | { type: "fallback_contact"; reason: string; contact: Contact }
  | OrderCard
  | CallbackCard;
/** What the visitor told us in the lead form (shown back in the "Lead saved" card). */
type SavedLead = { name: string; phone?: string; need?: string };

const MAX_LEN = 1000;
const DAY = 24 * 60 * 60 * 1000;
/** Server reasons that mean "no more AI replies for now" (quota, PR #1's per-chat cap). */
const LIMIT_REASONS = new Set(["quota", "cap"]);

const svg = (body: string, extra = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"') =>
  `<svg viewBox="0 0 24 24" ${extra} aria-hidden="true">${body}</svg>`;
const ICON_CLOSE = svg('<path d="M6 6l12 12M18 6L6 18"/>', 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"');
const ICON_PERSON = svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>');
const ICON_SEND = svg('<path d="M12 19V5M5 12l7-7 7 7"/>', 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"');
const ICON_TICK = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"');
const ICON_PHONE = svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>');
const ICON_EXT = svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>');
const ICON_CLOCK = svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
const ICON_WIFI = svg('<path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4-2.3M19 12.9a10 10 0 0 0-2.4-1.7M12 20h.01"/>');
const ICON_PAUSE = svg('<path d="M9 6v12M15 6v12"/>', 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"');
const ICON_WA = svg(
  '<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/>',
  'fill="currentColor"',
);

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
function icon(svgMarkup: string): HTMLElement {
  const s = document.createElement("span");
  s.style.display = "contents";
  s.innerHTML = svgMarkup;
  return s;
}

/** "+91 98765 43210" → "+91 98765 •••10": enough for the visitor to recognise their number. */
export function maskPhone(display: string): string {
  let seen = 0;
  const total = display.replace(/\D/g, "").length;
  return display.replace(/\d/g, (d) => {
    seen++;
    return seen <= Math.min(7, total - 5) || seen > total - 2 ? d : "•";
  });
}

/** wa.me wants the full international number as digits; tel: wants +E.164. Indian 10-digit numbers get +91. */
export function contactLinks(contact: Contact): { wa?: string; tel?: string; mail?: string } {
  const out: { wa?: string; tel?: string; mail?: string } = {};
  const e164 = (raw: string) => {
    const p = normalizePhone(raw);
    return p.ok ? p.e164 : raw.replace(/[^\d+]/g, "");
  };
  if (contact.whatsapp) {
    const digits = e164(contact.whatsapp).replace(/\D/g, "");
    if (digits) out.wa = `https://wa.me/${digits}`;
  }
  if (contact.phone) {
    const t = e164(contact.phone);
    if (t.replace(/\D/g, "")) out.tel = `tel:${t}`;
  }
  if (contact.email && isValidEmail(contact.email)) out.mail = contact.email.trim();
  return out;
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
  private statusEl!: HTMLElement;
  private netBanner!: HTMLElement;
  private nudgeEl: HTMLElement | null = null;
  private isOpen = false;
  private busy = false;
  private offline = false;
  /** No more AI replies for now (quota or cap). The composer is paused; handoff still works. */
  private limited = false;
  /** One message typed while a reply is in flight. Stays in the box until it sends. */
  private sendAfterReply = false;
  private restored = false;
  private hadUserMessage = false;
  private identity: Identity = {};
  private saved: Saved;
  private storeKey: string;
  private abort: AbortController | null = null;
  private prevOverflow: { html: string; body: string } | null = null;
  private media = window.matchMedia("(prefers-color-scheme: dark)");
  private fonts: FontLoader;
  private lastLead: SavedLead | null = null;

  constructor(private opts: WidgetOptions) {
    this.api = new Api(opts.base, opts.key, opts.testToken);
    this.fonts = new FontLoader(opts.base);
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

  private get business() {
    return (this.cfg.business || "the team").trim();
  }
  private get botName() {
    return (this.cfg.assistantName || "Assistant").trim();
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

    this.wrap = h("div", { class: `bl ${this.cfg.position === "left" ? "left" : "right"}${this.opts.fullscreen ? " full" : ""}` });
    this.applyTheme();
    this.media.addEventListener?.("change", () => this.applyTheme());

    // The launcher keeps the system font (CTO-HANDOFF §5): no font download before the visitor engages.
    this.launcher = h(
      "button",
      { class: "launcher", type: "button", "aria-label": `Ask ${this.botName}`, "aria-expanded": "false" },
      this.logo(),
      h("span", { class: "ll", text: `Ask ${this.botName}` }),
      h("span", { class: "li li-close" }, icon(ICON_CLOSE)),
    );
    this.launcher.addEventListener("click", () => (this.isOpen ? this.close() : this.open()));
    if (!this.opts.fullscreen) this.wrap.appendChild(this.launcher);

    this.root.appendChild(this.wrap);
    (document.body ?? document.documentElement).appendChild(this.host);

    this.offline = typeof navigator !== "undefined" && navigator.onLine === false;
    window.addEventListener("online", () => this.setOffline(false));
    window.addEventListener("offline", () => this.setOffline(true));

    if (this.opts.fullscreen) this.open();
    else this.scheduleNudge();
  }

  private applyTheme() {
    const t = this.cfg.theme;
    const dark = t === "dark" || (t === "auto" && this.media.matches);
    this.wrap.classList.toggle("dark", dark);
    for (const [k, v] of Object.entries(themeVars(this.cfg.primaryColor, dark))) this.wrap.style.setProperty(k, v);
  }

  /** The business's logo (the bot's https image), or its initial on a cream tile. */
  private logo() {
    const tile = h("span", { class: "logo", "aria-hidden": "true" });
    const url = this.cfg.avatarUrl;
    if (url && /^https:\/\//.test(url)) {
      const img = h("img", { src: url, alt: "" });
      img.addEventListener("error", () => img.replaceWith(this.initial()));
      tile.append(img);
    } else tile.append(this.initial());
    return tile;
  }
  private initial() {
    return document.createTextNode((this.cfg.business || this.cfg.assistantName || "A").trim().charAt(0).toUpperCase());
  }

  /** Set `lang` on text in Tamil or Devanagari and load that script's font (only then). */
  private langFor(el: HTMLElement, text: string) {
    const l = this.fonts.forText(text);
    if (l) el.setAttribute("lang", l);
    else el.removeAttribute("lang");
  }

  // ─── nudge ─────────────────────────────────────────────────────────────────
  private scheduleNudge() {
    const text = this.cfg.nudge;
    if (!text || getJSON<boolean>(`${this.storeKey}:nudge`, true) || this.saved.conversationId) return;
    window.setTimeout(() => {
      if (this.isOpen || this.hadUserMessage) return;
      this.fonts.load("latin");
      const x = h("button", { class: "x", type: "button", "aria-label": "Dismiss" }, icon(ICON_CLOSE));
      const nx = h("p", { class: "nx", text });
      this.langFor(nx, text);
      const chips = h("div", { class: "chips", role: "group", "aria-label": "Suggested questions" });
      for (const q of (this.cfg.suggestions ?? []).slice(0, 2)) {
        const b = h("button", { class: "chip", type: "button", text: q });
        this.langFor(b, q);
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          this.dismissNudge();
          void this.send(q);
        });
        chips.append(b);
      }
      this.nudgeEl = h(
        "div",
        { class: "nudge", role: "status" },
        h("div", { class: "nt" }, this.logo(), h("div", {}, h("b", { text: this.business }), nx)),
        chips.childElementCount ? chips : null,
        x,
      );
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
    this.fonts.load("latin");
    if (!this.panel) this.buildPanel();
    this.panel!.hidden = false;
    this.wrap.classList.add("open");
    this.launcher.setAttribute("aria-expanded", "true");
    this.launcher.setAttribute("aria-label", "Close chat");
    this.lockScroll(true);
    this.fitViewport();
    if (!this.restored) void this.restore();
    window.setTimeout(() => (this.input.disabled ? this.panel?.querySelector<HTMLElement>(".close") : this.input)?.focus({ preventScroll: true }), 30);
  }

  close() {
    if (!this.isOpen || this.opts.fullscreen) return;
    this.isOpen = false;
    this.panel!.hidden = true;
    this.wrap.classList.remove("open");
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.setAttribute("aria-label", `Ask ${this.botName}`);
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
    // On phones the sheet is pinned to the top of the page viewport; when the keyboard opens the
    // browser may also slide the visible area down inside it, so follow it by the same amount.
    if (this.isMobile() || this.opts.fullscreen) this.panel.style.transform = vv.offsetTop ? `translateY(${Math.round(vv.offsetTop)}px)` : "";
    else this.panel.style.transform = "";
    // The newest message stays in view when the keyboard takes half the screen.
    if (this.list) this.scroll();
  };

  // ─── panel ─────────────────────────────────────────────────────────────────
  private buildPanel() {
    const c = this.cfg;
    const closeBtn = h("button", { class: "close", type: "button", "aria-label": "Close chat" }, icon(ICON_CLOSE));
    closeBtn.addEventListener("click", () => this.close());
    const titleId = "bl-title";
    this.statusEl = h(
      "p",
      { class: "status" },
      h("i", { class: c.isOpen ? "dot" : "dot off", "aria-hidden": "true" }),
      h("span", { text: `${this.business} · ${c.isOpen ? "replies instantly" : "closed now"}` }),
    );
    const head = h("div", { class: "head" }, this.logo(), h("div", { class: "who" }, h("h2", { id: titleId, text: this.botName }), this.statusEl), closeBtn);

    // Banners sit between the header and the conversation. role=status so they're announced.
    this.netBanner = h("div", { class: "banner net", role: "status", hidden: true }, icon(ICON_WIFI), h("span", { text: "You're offline. Reconnect to send messages." }));
    const closedBanner = c.isOpen
      ? null
      : h("div", { class: "banner", role: "status" }, icon(ICON_CLOCK), h("span", { text: `${this.business} is closed now. I can still answer, and the team will get back to you.` }));

    this.list = h("div", { class: "msgs", role: "log", "aria-live": "polite", "aria-relevant": "additions", "aria-label": "Conversation", tabindex: "0" });
    this.chips = h("div", { class: "chips", role: "group", "aria-label": "Suggested questions" });

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

    const human = h("button", { class: "human", type: "button" }, icon(ICON_PERSON), h("span", { text: "Talk to a person" }));
    human.addEventListener("click", () => this.talkToPerson());

    const by = h("span", { class: "by" });
    if (c.showPoweredBy) by.append(h("span", { text: "Powered by Botly\u00a0·" }));
    by.append(h("a", { href: c.privacyUrl, target: "_blank", rel: "noopener noreferrer", text: "Privacy" }));
    const meta = h("div", { class: "meta" }, human, by);

    const foot = h("div", { class: "foot" }, h("div", { class: "composer" }, this.input, this.sendBtn), this.counter, meta);

    this.panel = h("div", { class: "panel", role: "dialog", "aria-modal": this.opts.fullscreen ? "false" : "true", "aria-labelledby": titleId }, head, this.netBanner, closedBanner, this.list, this.chips, foot);
    this.panel.addEventListener("keydown", (e) => this.onPanelKey(e));
    this.wrap.appendChild(this.panel);
    window.visualViewport?.addEventListener("resize", this.fitViewport);
    window.visualViewport?.addEventListener("scroll", this.fitViewport);

    if (c.greeting) this.addBot(c.greeting, new Date(), false);
    this.renderChips(c.suggestions);
    if (c.quotaExceeded) this.addCard({ type: "fallback_contact", reason: "quota", contact: c.fallbackContact });
    this.setOffline(this.offline);
  }

  private onPanelKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.key !== "Tab" || this.opts.fullscreen) return;
    const focusables = Array.from(
      this.panel!.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']"),
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

  private setBusy(busy: boolean) {
    this.busy = busy;
    this.panel?.classList.toggle("busy", busy);
    this.onInput();
  }

  private setOffline(offline: boolean) {
    this.offline = offline;
    if (!this.panel) return;
    this.netBanner.hidden = !offline;
    this.onInput();
  }

  /** Reply limit reached: pause the composer (the server would only answer with the contact card). */
  private setLimited() {
    if (this.limited) return;
    this.limited = true;
    this.chips.replaceChildren();
    this.input.value = "";
    this.input.disabled = true;
    this.input.placeholder = "Replies are paused. Contact the team above.";
    this.onInput();
  }

  private onInput() {
    if (!this.input) return;
    const el = this.input;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
    const n = el.value.length;
    if (this.sendAfterReply && el.value.trim()) this.counter.textContent = "Will send after the reply";
    else this.counter.textContent = n > MAX_LEN - 100 ? `${n}/${MAX_LEN}` : "";
    // Typing stays possible while a reply streams in (it queues); offline or paused stops sending.
    this.sendBtn.disabled = this.offline || this.limited || !el.value.trim();
    this.langFor(el, el.value);
  }

  private renderChips(questions: string[]) {
    this.chips.replaceChildren();
    if (this.limited) return;
    for (const [i, q] of questions.slice(0, 4).entries()) {
      const b = h("button", { class: "chip", type: "button", text: q });
      this.langFor(b, q);
      b.style.animationDelay = `${i * 60}ms`;
      b.addEventListener("click", () => {
        if (this.busy) {
          if (!this.input.value.trim()) this.input.value = q;
          this.sendAfterReply = true;
          this.onInput();
          return;
        }
        void this.send(q);
      });
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
    this.langFor(bubble, text);
    const row = h("div", { class: "row user" }, bubble, h("div", { class: "time", text: this.time(at) }));
    this.list.append(row);
    this.scroll();
    return row;
  }

  private addBot(text: string, at = new Date(), live = true) {
    const bubble = h("div", { class: "bubble" });
    bubble.append(renderBlocks(parseMarkdownLite(text), document));
    this.langFor(bubble, text);
    const row = h("div", { class: "row bot" }, bubble, h("div", { class: "time", text: this.time(at) }));
    if (!live) row.setAttribute("aria-live", "off");
    this.list.append(row);
    this.scroll();
    return { row, bubble };
  }

  private addEvent(text: string) {
    const b = h("div", { class: "bubble", text });
    this.langFor(b, text);
    this.list.append(h("div", { class: "row event" }, b));
    this.scroll();
  }

  private addTyping() {
    const row = h(
      "div",
      { class: "row bot typing-row", role: "status" },
      h("div", { class: "bubble typing", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
      h("span", { class: "typing-text", text: `${this.botName} is typing…` }),
    );
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
    if (!text || this.offline || this.limited) return;
    if (this.busy) {
      this.sendAfterReply = true;
      this.onInput();
      return;
    }
    this.sendAfterReply = false;
    this.input.value = "";
    this.onInput();
    void this.send(text);
  }

  /** Sends the one message the visitor typed while the previous reply was still coming in. */
  private flushQueued() {
    if (!this.sendAfterReply) return;
    this.sendAfterReply = false;
    const text = this.input.value.trim();
    if (!text || this.offline || this.limited) {
      this.onInput();
      return;
    }
    this.input.value = "";
    this.onInput();
    void this.send(text);
  }

  async send(text: string, existingRow?: HTMLElement) {
    text = text.slice(0, MAX_LEN).trim();
    if (!text || this.busy) return;
    if (!this.isOpen) this.open();
    if (this.limited) return;
    this.setBusy(true);
    this.hadUserMessage = true;
    this.chips.replaceChildren();
    const userRow = existingRow ?? this.addUser(text);
    userRow.querySelector(".errline")?.remove();

    const typing = this.addTyping();
    let bot: { row: HTMLElement; bubble: HTMLElement } | null = null;
    let full = "";
    let raf = 0;
    const paint = () => {
      raf = 0;
      if (!bot) return;
      // While streaming, close an unfinished **bold** so raw asterisks never flash.
      const shown = (full.match(/\*\*/g)?.length ?? 0) % 2 ? full.replace(/\s+$/, "") + "**" : full;
      bot.bubble.replaceChildren(renderBlocks(parseMarkdownLite(shown), document));
      this.langFor(bot.bubble, full);
      this.scroll();
    };
    const ensureBot = () => {
      if (!bot) {
        typing.remove();
        bot = this.addBot("", new Date());
        bot.bubble.classList.add("streaming");
      }
      return bot;
    };

    this.abort = new AbortController();
    const timer = window.setTimeout(() => this.abort?.abort(), 45_000);
    let failed: { status?: number } | null = null;
    try {
      if (this.offline) throw new Error("offline");
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
              full += data.text ?? "";
              // Don't open a bubble for whitespace alone (it would leave an empty gap).
              if (bot || full.trim()) {
                ensureBot();
                if (!raf) raf = requestAnimationFrame(paint);
              }
            } else if (event === "tool_card") {
              typing.remove();
              this.addCard(data as Card);
            } else if (event === "suggestions") {
              this.renderChips(data.questions ?? []);
            } else if (event === "error") {
              typing.remove();
              // These codes arrive together with a contact card, which says it better.
              if (data.code !== "inactive" && data.code !== "llm_error" && data.code !== "ai_unavailable") this.addEvent(data.message ?? "Something went wrong.");
            } else if (event === "done") {
              if (data.conversationId) {
                this.saved.conversationId = data.conversationId;
                this.persist();
              }
              if (data.quota) this.setLimited();
            }
            window.dispatchEvent(new CustomEvent("botly:event", { detail: { event, data } }));
          },
        },
        this.abort.signal,
      );
    } catch (e) {
      failed = { status: (e as { status?: number })?.status };
    } finally {
      window.clearTimeout(timer);
      typing.remove();
      if (raf) cancelAnimationFrame(raf);
      paint();
      const b = bot as { row: HTMLElement; bubble: HTMLElement } | null;
      if (b) {
        b.bubble.classList.remove("streaming");
        if (!full.trim()) b.row.remove();
      }
      this.setBusy(false);
      this.flushQueued();
    }
    if (failed && !full) {
      const why = this.offline || !failed.status ? "Not sent. Check your connection." : "Not sent. Something went wrong on our side.";
      const retry = h("button", { class: "retry", type: "button", text: "Retry" });
      retry.addEventListener("click", () => {
        if (this.offline) return;
        void this.send(text, userRow);
      });
      userRow.append(h("div", { class: "errline", role: "alert" }, h("span", { text: why }), retry));
      this.scroll();
    }
  }

  // ─── cards ─────────────────────────────────────────────────────────────────
  private addCard(card: Card) {
    let el: HTMLElement;
    if (card.type === "lead_form") el = this.leadForm(card);
    else if (card.type === "lead_saved") el = this.savedCard(card.name, card.handoff, null);
    else if (card.type === "order_status") el = this.orderCard(card);
    else if (card.type === "callback_form") el = this.callbackForm(card);
    else {
      if (LIMIT_REASONS.has(card.reason)) this.setLimited();
      el = this.handoffCard(card.contact ?? {}, card.reason);
    }
    this.list.append(h("div", { class: "row bot cardrow" }, el));
    this.scroll();
  }

  /**
   * "Lead saved": names the business, shows back what was sent, and the (masked) number they'll use.
   * We don't say *how* the business is notified (email/WhatsApp alerts depend on its settings).
   */
  private savedCard(name: string, handoff: boolean, lead: SavedLead | null) {
    const p = lead?.phone ? normalizePhone(lead.phone) : null;
    const on = p && p.ok ? maskPhone(p.display) : null;
    const note = h("p", { class: "note" }, `${this.business} has your details and will ${handoff ? "get in touch" : "contact you"} soon`);
    if (on) note.append(" on ", h("span", { style: "white-space:nowrap", text: on }));
    note.append(".");
    const card = h(
      "div",
      { class: "card", role: "status" },
      h("div", { class: "ok" }, h("span", { class: "tick" }, icon(ICON_TICK)), h("div", {}, h("h3", { text: "Lead saved" }), note)),
    );
    const rows: [string, string][] = [];
    if (lead?.name || name) rows.push(["Name", lead?.name || name]);
    if (lead?.need) rows.push(["Need", lead.need]);
    if (rows.length) {
      const s = h("div", { class: "summary" });
      for (const [k, v] of rows) {
        const b = h("b", { text: v });
        this.langFor(b, v);
        s.append(h("div", {}, h("span", { text: k }), b));
      }
      card.append(s);
    }
    return card;
  }

  private orderCard(o: OrderCard) {
    const pill = h("span", { class: "pill warm", text: o.status });
    const card = h("div", { class: "card", role: "status" }, h("h3", {}, `Order ${o.orderNumber}`));
    const row = (label: string, value: Node | string) => card.append(h("div", { class: "kv" }, h("span", { text: label }), typeof value === "string" ? h("b", { text: value }) : value));
    row("Status", pill);
    if (o.carrier) row("Courier", o.carrier);
    if (o.expectedDate) {
      let d = o.expectedDate;
      try {
        d = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(new Date(o.expectedDate + "T12:00:00"));
      } catch {}
      row("Expected", d);
    }
    if (o.trackingUrl && /^https:\/\//.test(o.trackingUrl))
      card.append(h("a", { class: "btn ghost track", href: o.trackingUrl, target: "_blank", rel: "noopener noreferrer" }, "Track package", icon(ICON_EXT)));
    return card;
  }

  private callbackForm(card: CallbackCard) {
    const pre = { ...card.prefill, name: card.prefill?.name ?? this.identity.name, phone: card.prefill?.phone ?? this.identity.phone };
    const uid = Math.random().toString(36).slice(2, 7);
    const lbl = (id: string, text: string, optional = false) => h("label", { for: `${id}-${uid}` }, text, optional ? h("span", { text: " (optional)" }) : null);
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
      h("h3", { text: "Book a callback" }),
      h("p", { class: "note", text: `${this.business} will call you in the slot you pick.` }),
      lbl("cn", "Your name"), name,
      lbl("cp", "Phone number"), phone,
      lbl("cd", "Date"), date,
      lbl("cs", "Time"), slot,
      lbl("cw", "What is it about?", true), need,
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
        let when = date.value;
        try {
          when = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(new Date(date.value + "T12:00:00"));
        } catch {}
        const note = h("p", { class: "note" }, `Callback booked for ${when}, ${slot.value}. ${this.business} will call you on `, h("span", { style: "white-space:nowrap", text: maskPhone(p.display) }), ".");
        form.replaceWith(h("div", { class: "card", role: "status" }, h("div", { class: "ok" }, h("span", { class: "tick" }, icon(ICON_TICK)), h("div", {}, h("h3", { text: "Callback booked" }), note))));
        this.scroll();
      } catch (ex) {
        err.textContent = ex instanceof Error && ex.message !== "Failed to fetch" ? ex.message : "Couldn't book. Please try again.";
        submit.disabled = false;
        submit.textContent = "Book callback";
      }
    });
    return form;
  }

  /**
   * Handoff card: WhatsApp and Call buttons that go straight to the business's own number
   * (wa.me / tel:), the email if set, and "leave your number" (the lead form) as the fallback.
   * Also used when chat can't continue (reply limit, bot switched off, server error).
   */
  private handoffCard(contact: Contact, reason: string) {
    const links = contactLinks(contact);
    const limit = LIMIT_REASONS.has(reason);
    const trouble = reason === "inactive" || reason === "error" || reason === "busy";
    const card = h("div", { class: "card handoff" });
    const title = limit ? "Chat is paused for now" : trouble ? "Chat is having trouble" : `Talk to a person at ${this.business}`;
    const h3 = h("h3", {}, limit ? h("span", { class: "tick warm", style: "width:28px;height:28px" }, icon(ICON_PAUSE)) : null, title);
    card.append(h3);
    if (!limit && !trouble)
      card.append(h("p", { class: "note" }, h("span", { class: this.cfg.isOpen ? "pill" : "pill warm", text: this.cfg.isOpen ? "● Open now" : "Closed now" })));
    const any = links.wa || links.tel || links.mail;
    card.append(
      h("p", {
        class: "note",
        text: !any
          ? "Please try again a little later."
          : limit || trouble
            ? `You can still reach ${this.business} directly. A person will reply.`
            : links.wa
              ? "Pick what's easiest. WhatsApp opens a chat with their own number."
              : `Reach ${this.business} directly.`,
      }),
    );
    const btns = h("div", { class: links.wa && links.tel ? "btns" : "btns one" });
    if (links.wa) btns.append(h("a", { class: "btn wa", href: links.wa, target: "_blank", rel: "noopener noreferrer" }, icon(ICON_WA), "WhatsApp"));
    if (links.tel) btns.append(h("a", { class: "btn ghost", href: links.tel }, icon(ICON_PHONE), "Call"));
    if (btns.childElementCount) card.append(btns);
    if (links.mail) card.append(h("div", {}, h("a", { class: "mail", href: `mailto:${links.mail}`, text: `Email ${links.mail}` })));
    if (reason !== "inactive" && !this.saved.handedOff) {
      const more = h("button", { class: "link", type: "button", text: "Or leave your number and they'll call you" });
      more.addEventListener("click", () => {
        more.remove();
        this.addCard({ type: "lead_form", leadType: "human", prefill: {} });
      });
      card.append(more);
    }
    return card;
  }

  private leadForm(card: LeadCard) {
    const pre = { ...card.prefill, ...this.identity };
    const uid = Math.random().toString(36).slice(2, 7);
    const field = (id: string, label: string, input: HTMLInputElement | HTMLTextAreaElement, hint?: string, optional = false) =>
      h("div", {}, h("label", { for: `${id}-${uid}` }, label, optional ? h("span", { text: " (optional)" }) : null), input, hint ? h("div", { class: "hint", text: hint }) : null);
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
    const label = `Send to ${this.business}`;
    const submit = h("button", { class: "btn", type: "submit", text: label });
    const human = card.leadType === "human";
    const form = h(
      "form",
      { class: "card", novalidate: true, "aria-label": "Contact details" },
      h("h3", { text: human ? "Talk to a person" : "Want the team to call you?" }),
      h("p", { class: "note", text: `${this.business} gets these details and will call or WhatsApp you.` }),
      field("n", "Your name", name),
      field("p", "Phone number", phone, "Outside India? Start with + and your country code."),
      field("e", "Email", email, undefined, true),
      field("d", "What do you need?", need, undefined, true),
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
        if (human) this.saved.handedOff = true;
        this.persist();
        this.lastLead = { name: name.value.trim(), phone: phone.value.trim(), need: need.value.trim() || undefined };
        form.replaceWith(this.savedCard(name.value.trim(), human, this.lastLead));
        this.scroll();
      } catch (ex) {
        err.textContent = ex instanceof Error && ex.message !== "Failed to fetch" ? ex.message : "Couldn't send. Please try again.";
        submit.disabled = false;
        submit.textContent = label;
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
    const c = this.cfg.fallbackContact ?? {};
    const links = contactLinks(c);
    if (links.wa || links.tel) this.addCard({ type: "fallback_contact", reason: "human", contact: c });
    else this.addCard({ type: "lead_form", leadType: "human", prefill: {} });
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

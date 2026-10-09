import { parse, type HTMLElement } from "node-html-parser";
import { contrastRatio, parseHex } from "../../widget/src/color";
import { safeFetch, UnsafeUrlError } from "./url-guard";

/**
 * Copies a prospect's homepage for a demo: fetch it, strip everything that could run or
 * collect data (scripts, frames, forms, other chat widgets), point every asset at their
 * own servers so it still looks like their site, and add Botly's bar and widget.
 *
 * The copy is static on purpose. Their JavaScript never runs: the route that serves it
 * also sends a Content-Security-Policy that only allows Botly's own two scripts.
 */
export const MAX_SNAPSHOT_BYTES = 2_000_000;
/** Replaced with the request's own origin when the demo is served (works on any Botly host). */
export const ORIGIN_TOKEN = "__BOTLY_ORIGIN__";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

export class SnapshotError extends Error {
  constructor(message: string, readonly needsRender = false) {
    super(message);
  }
}

export type Fetched = { html: string; finalUrl: string };

/** Signs that we were served a bot check instead of the page. */
export function looksBlocked(status: number, body: string): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  const head = body.slice(0, 6000).toLowerCase();
  return /cf-chl|cf_chl_|just a moment\.\.\.|attention required! \| cloudflare|checking your browser|enable javascript and cookies to continue|ddos protection by|access denied|captcha-delivery|px-captcha|incapsula incident/.test(head);
}

export async function fetchHomepage(url: string, fetchImpl?: typeof fetch): Promise<Fetched> {
  let res;
  try {
    res = await safeFetch(url, {
      fetchImpl,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-IN,en;q=0.9" },
    });
  } catch (e) {
    if (e instanceof UnsafeUrlError) throw new SnapshotError(e.message);
    throw new SnapshotError(e instanceof Error && e.name === "TimeoutError" ? "The website took too long to answer." : "We couldn't reach that website. Check the address and try again.");
  }
  if (looksBlocked(res.status, res.body)) throw new SnapshotError("This site blocks automated copies, so its homepage can't be previewed.", true);
  if (res.status >= 400) throw new SnapshotError(`The website answered with an error (${res.status}).`);
  if (!/html/i.test(res.headers.get("content-type") ?? "text/html")) throw new SnapshotError("That address isn't a web page.");
  return { html: res.body, finalUrl: res.finalUrl };
}

/** Pages built in the browser arrive almost empty: the copy would be a blank page. */
export function needsRendering(html: string): boolean {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: true } });
  const body = root.querySelector("body");
  if (!body) return true;
  const clone = parse(body.toString(), { comment: false, blockTextElements: { script: true, style: true, noscript: true } });
  clone.querySelectorAll("script,style,noscript,template,svg").forEach((n) => n.remove());
  const text = clone.structuredText.replace(/\s+/g, " ").trim();
  if (text.length >= 400) return false;
  const emptyRoot = ["#root", "#__next", "#app", "#__nuxt", "#svelte", "app-root"].some((sel) => {
    const el = body.querySelector(sel);
    return el && el.structuredText.trim().length < 80;
  });
  return emptyRoot || text.length < 400;
}

// ─── clean-up ────────────────────────────────────────────────────────────────

const REMOVE = [
  "script", "noscript", "iframe", "frame", "frameset", "object", "embed", "applet", "base", "portal", "template",
  'meta[http-equiv="refresh" i]', 'meta[http-equiv="Content-Security-Policy" i]', 'meta[http-equiv="X-Frame-Options" i]',
  'link[rel="manifest" i]', 'link[rel="serviceworker" i]', 'link[rel="modulepreload" i]', 'link[rel="canonical" i]', 'link[rel="alternate" i]',
  'link[rel="prefetch" i]', 'link[rel="prerender" i]', 'link[rel="dns-prefetch" i]',
  'meta[property^="og:" i]', 'meta[name^="twitter:" i]', 'meta[name="robots" i]', 'meta[name="googlebot" i]',
  'input[type="password" i]',
];

/** Other vendors' chat bubbles, floating WhatsApp buttons, cookie bars and pop-ups. */
const WIDGET_RE =
  /(^|[\s_-])(tawk|crisp|intercom|zendesk|zopim|freshchat|fc_frame|tidio|wati|interakt|drift|hubspot-messages|livechat|chat-widget|chatwidget|chat-bubble|elfsight|gb-widget|wa-chat|wa-(?:float|button|widget)|whatsapp-(?:float|button|chat|widget|icon|sticky|fixed|bubble|cta)|whats-?help|(?:float|floating|sticky|fixed)-whatsapp|joinchat|click-to-chat|cookie-(?:banner|bar|notice|consent|law)|cookiebanner|cookieconsent|cc-window|onetrust|gdpr|newsletter-(?:popup|modal)|popup-(?:newsletter|modal|overlay)|klaviyo-form|privy|optinmonster)([\s_-]|$)/i;

/** Links that only make sense on the real site. */
const DISABLED_LINK_RE = /\/(cart|checkout|basket|login|log-in|signin|sign-in|signup|sign-up|register|account|my-account|wp-login|wp-admin|admin)(\/|\.|\?|#|$)/i;

const URL_ATTRS = ["src", "href", "poster", "data-src", "data-lazy-src", "data-original", "data-bg", "data-background", "action"];
const SRCSET_ATTRS = ["srcset", "data-srcset", "data-lazy-srcset", "imagesrcset"];
const LAZY_SRC = ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-echo"];
const LAZY_SRCSET = ["data-srcset", "data-lazy-srcset"];

function absolute(value: string, base: string): string | null {
  const v = value.trim();
  if (!v || v.startsWith("#")) return null;
  if (/^(data|blob|mailto|tel|sms|about):/i.test(v)) return null;
  if (/^\s*(javascript|vbscript|file):/i.test(v)) return "";
  try {
    const u = new URL(v, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return null;
  }
}

function absoluteSrcset(value: string, base: string): string {
  return value
    .split(/,(?=\s*\S+(?:\s+[\d.]+[wx])?\s*(?:,|$))|,\s+/)
    .map((part) => {
      const [url, ...rest] = part.trim().split(/\s+/);
      if (!url) return "";
      const abs = absolute(url, base);
      return [abs === null ? url : abs, ...rest].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

/** url(...) and @import inside CSS → absolute, so relative background images keep working. */
export function absoluteCss(css: string, base: string): string {
  return css
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q: string, u: string) => {
      const abs = absolute(u, base);
      return abs === null ? m : abs === "" ? "url()" : `url(${q}${abs}${q})`;
    })
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q: string, u: string) => {
      const abs = absolute(u, base);
      return abs ? `@import ${q}${abs}${q}` : m;
    })
    .replace(/expression\s*\(|-moz-binding\s*:|behavior\s*:/gi, "x-removed:");
}

const isPlaceholder = (src: string | undefined) => !src || /^data:/i.test(src) || /placeholder|blank\.|spacer|transparent|lazy|loading\.(gif|svg)|1x1/i.test(src);

/** The brand colour for the widget: theme-color, else the commonest button colour, else Botly's. */
export function pickBrandColor(root: HTMLElement, fallback = "#4f46e5"): string {
  const usable = (hex: string | undefined | null) => {
    const rgb = hex ? parseHex(hex) : null;
    if (!rgb) return null;
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Greys, near-white and near-black aren't a brand colour (and make a poor chat bubble).
    if (max - min < 24) return null;
    const full = "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
    return contrastRatio(full, "#ffffff") < 1.6 ? null : full;
  };
  const theme = usable(root.querySelector('meta[name="theme-color" i]')?.getAttribute("content"));
  if (theme) return theme;
  const counts = new Map<string, number>();
  const css = root.querySelectorAll("style").map((s) => s.text).join("\n");
  for (const m of css.matchAll(/([^{}]{1,200})\{([^{}]{0,600})\}/g)) {
    if (!/(^|[\s,.>#])(button|a\.button|\.btn|\.button|\[type=["']?submit|\.cta|\.wp-block-button__link|\.elementor-button)/i.test(m[1]!)) continue;
    const bg = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,6})\b/i.exec(m[2]!)?.[1];
    const c = usable(bg);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  for (const el of root.querySelectorAll("button[style], a[style], input[type=submit][style]")) {
    const c = usable(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,6})\b/i.exec(el.getAttribute("style") ?? "")?.[1]);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

/** The business name when the admin didn't type one. */
export function pickBusinessName(html: string, finalUrl: string): string {
  const root = parse(html, { comment: false });
  const site = root.querySelector('meta[property="og:site_name" i]')?.getAttribute("content")?.trim();
  if (site && site.length >= 2) return site.slice(0, 120);
  const title = root.querySelector("title")?.text.replace(/\s+/g, " ").trim() ?? "";
  // "Home | Ananya Handlooms" / "Ananya Handlooms - Sarees online": keep the part that looks like a name.
  const parts = title.split(/\s+[|\-–—:·»]\s+/).map((p) => p.trim()).filter(Boolean);
  const host = new URL(finalUrl).hostname.replace(/^www\./, "").split(".")[0] ?? "Your business";
  const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  // "AI Platform for Growth | Valopt" on valopt.ai: the part that matches the domain is the name.
  const byDomain = parts.find((p) => letters(p).length >= 3 && (letters(host).includes(letters(p)) || letters(p).includes(letters(host))));
  const name = byDomain ?? parts.find((p) => !/^(home|homepage|welcome|index|official (web)?site)$/i.test(p)) ?? "";
  if (name.length >= 2 && name.length <= 80) return name;
  return host.charAt(0).toUpperCase() + host.slice(1);
}

export type SnapshotInput = {
  html: string;
  finalUrl: string;
  businessName: string;
  slug: string;
  publicKey: string;
  testToken: string;
};
export type Snapshot = { html: string; bytes: number; color: string; removed: { scripts: number; widgets: number; forms: number } };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Turns the fetched page into the stored demo page. Pure: no network. */
export function cleanSnapshot(input: SnapshotInput): Snapshot {
  const base = input.finalUrl;
  const root = parse(input.html, { comment: false, blockTextElements: { script: true, style: true, noscript: true, pre: true } });
  const html = root.querySelector("html");
  let head = root.querySelector("head");
  const body = root.querySelector("body");
  if (!html || !body) throw new SnapshotError("That page has no content we can copy.", true);
  if (!head) {
    html.insertAdjacentHTML("afterbegin", "<head></head>");
    head = root.querySelector("head")!;
  }
  const color = pickBrandColor(root);

  // Stylesheets tucked inside <noscript> (deferred-CSS pattern) are the real ones once scripts are gone.
  for (const ns of head.querySelectorAll("noscript")) {
    const inner = parse(ns.innerHTML);
    for (const link of inner.querySelectorAll('link[rel="stylesheet" i]')) head.insertAdjacentHTML("beforeend", link.toString());
  }

  const removed = { scripts: root.querySelectorAll("script").length, widgets: 0, forms: 0 };
  for (const sel of REMOVE) root.querySelectorAll(sel).forEach((n) => n.remove());
  // Script preloads, and "print until loaded" stylesheet tricks that relied on an onload handler.
  for (const link of root.querySelectorAll("link")) {
    const rel = (link.getAttribute("rel") ?? "").toLowerCase();
    const as = (link.getAttribute("as") ?? "").toLowerCase();
    if (rel.includes("preload") && as === "script") link.remove();
    else if (rel.includes("preload") && as === "style") link.setAttribute("rel", "stylesheet");
    else if (rel.includes("stylesheet") && (link.getAttribute("media") ?? "").toLowerCase() === "print" && link.getAttribute("onload")) link.setAttribute("media", "all");
  }

  for (const el of root.querySelectorAll("*")) {
    const tag = el.rawTagName?.toLowerCase();
    if (!tag) continue;
    const idClass = `${el.getAttribute("id") ?? ""} ${el.getAttribute("class") ?? ""}`;
    // A floating "chat on WhatsApp" link is a competing chat button even when its class says nothing else.
    const waFloat = tag === "a" && /(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)/i.test(el.getAttribute("href") ?? "") && /float|fixed|sticky|bubble|widget|chat/i.test(idClass);
    if (tag !== "html" && tag !== "body" && tag !== "head" && idClass.trim() && (waFloat || WIDGET_RE.test(idClass))) {
      el.remove();
      removed.widgets++;
      continue;
    }
    for (const name of Object.keys(el.attributes)) {
      const lower = name.toLowerCase();
      // Inline handlers, and attributes that can smuggle markup or navigation.
      if (lower.startsWith("on") || lower === "srcdoc" || lower === "formaction" || lower === "ping" || lower === "integrity" || lower === "nonce") el.removeAttribute(name);
    }
    // Lazy-loaded images: their real address sits in a data attribute a script would have copied over.
    if (tag === "img" || tag === "source" || tag === "video") {
      const lazy = LAZY_SRC.map((a) => el.getAttribute(a)).find(Boolean);
      if (lazy && isPlaceholder(el.getAttribute("src"))) el.setAttribute("src", lazy);
      const lazySet = LAZY_SRCSET.map((a) => el.getAttribute(a)).find(Boolean);
      if (lazySet && !el.getAttribute("srcset")) el.setAttribute("srcset", lazySet);
      if (tag === "img") el.removeAttribute("loading");
    }
    for (const name of URL_ATTRS) {
      const v = el.getAttribute(name);
      if (v == null) continue;
      const abs = absolute(v, base);
      if (abs === "") el.removeAttribute(name);
      else if (abs !== null) el.setAttribute(name, abs);
    }
    for (const name of SRCSET_ATTRS) {
      const v = el.getAttribute(name);
      if (v) el.setAttribute(name, absoluteSrcset(v, base));
    }
    const style = el.getAttribute("style");
    if (style) el.setAttribute("style", absoluteCss(style, base));

    if (tag === "a" || tag === "area") {
      const raw = el.getAttribute("href") ?? "";
      if (raw.startsWith("#")) {
        // With <base> set, "#top" would navigate to their site: our script scrolls instead.
        el.setAttribute("data-botly-demo-hash", raw);
      } else if (raw) {
        if (DISABLED_LINK_RE.test(raw)) {
          el.setAttribute("href", "#");
          el.setAttribute("data-botly-demo-disabled", "");
        } else if (/^https?:/i.test(raw)) {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer nofollow");
        }
      }
    } else if (tag === "form") {
      el.setAttribute("action", "about:blank");
      el.setAttribute("data-botly-demo-disabled", "");
      el.removeAttribute("target");
      removed.forms++;
    } else if (tag === "style") {
      el.set_content(absoluteCss(el.text, base));
    }
  }

  // Head: ours first, so nothing of theirs can change how the page resolves or is indexed.
  root.querySelectorAll("title").forEach((t) => t.remove());
  head.insertAdjacentHTML(
    "afterbegin",
    `<base href="${esc(base)}"><meta charset="utf-8"><title>Preview · ${esc(input.businessName)}</title><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer">`,
  );
  // Content that their scripts would have revealed (scroll animations, lazy fades) must be visible without them.
  head.insertAdjacentHTML(
    "beforeend",
    `<style id="botly-demo-fixes">[data-aos],[data-sal],.wow,.aos-init,.elementor-invisible,.lazyload,.lazyloading,.lazy,.js-reveal,.reveal,.animate-on-scroll,.fade-in,[data-scroll]{opacity:1!important;visibility:visible!important;transform:none!important;animation:none!important}html.no-js,html{visibility:visible!important;opacity:1!important}body{visibility:visible!important;opacity:1!important}#preloader,.preloader,.page-loader,.loader-wrapper,.loading-overlay,#loader-wrapper,.pace{display:none!important}</style>`,
  );

  body.insertAdjacentHTML(
    "beforeend",
    `<div id="botly-demo-bar" data-business="${esc(input.businessName)}" data-cta="${ORIGIN_TOKEN}/login?signup=1&amp;ref=demo-${esc(input.slug)}"></div>` +
      `<script src="${ORIGIN_TOKEN}/demo-bar.js" defer></script>` +
      `<script src="${ORIGIN_TOKEN}/widget.js" data-key="${esc(input.publicKey)}" data-test-token="${esc(input.testToken)}" async></script>`,
  );

  const out = "<!doctype html>\n" + root.querySelector("html")!.toString();
  const bytes = Buffer.byteLength(out, "utf8");
  if (bytes > MAX_SNAPSHOT_BYTES) throw new SnapshotError("That homepage is too large to preview (over 2 MB of HTML).");
  return { html: out, bytes, color, removed };
}

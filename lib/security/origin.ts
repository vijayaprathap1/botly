/**
 * Origin allow-listing for the public widget endpoints. The widget only shows and chats on
 * a bot's allowed domains; the server enforces this on every widget endpoint.
 *
 * An entry in bots.allowed_origins names one HOST. Scheme, port, path, query and trailing
 * slash are ignored, so "https://shop.com/", "http://shop.com:8080/about" and "shop.com" all
 * mean shop.com. The www. twin counts as the same host: "shop.com" allows www.shop.com and
 * "www.shop.com" allows shop.com.
 *   "shop.com"         shop.com and www.shop.com only (never evilshop.com, shop.com.evil.io
 *                      or app.shop.com)
 *   "*.shop.com"       any subdomain of shop.com (not shop.com itself; add it too if needed)
 *   "localhost"        local pages, on any port; local testing works only when listed
 * There is no allow-all: "*" or an empty list allows nothing.
 */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (!v || v === "null") return null;
  try {
    const u = new URL(v.includes("://") ? v : `https://${v}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** The host an allow-list entry names, or null when it isn't one we can match safely. */
export function entryHost(raw: string): { host: string; wildcard: boolean } | null {
  let v = raw.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  v = v.replace(/[/?#].*$/, ""); // path, query, fragment, trailing slash
  v = v.replace(/^[^@]*@/, ""); // user:pass@
  if (v.startsWith("[")) v = v.slice(0, v.indexOf("]") + 1); // [::1]:3000 → [::1]
  else v = v.replace(/:\d*$/, ""); // port
  v = v.replace(/\.+$/, "");
  const wildcard = v.startsWith("*.");
  if (wildcard) v = v.slice(2);
  if (!v || v.includes("*")) return null;
  let host: string;
  try {
    host = new URL(`http://${v}`).hostname; // also punycodes non-ASCII names
  } catch {
    return null;
  }
  if (!host || (wildcard && !host.includes("."))) return null; // "*.com" style entries are refused
  return { host: wildcard ? host : host.replace(/^www\./, ""), wildcard };
}

export function isOriginAllowed(origin: string | null | undefined, allowed: readonly string[]): boolean {
  const o = normalizeOrigin(origin);
  if (!o) return false;
  const hostname = new URL(o).hostname;
  const pageHost = hostname.replace(/^www\./, "");
  for (const raw of allowed) {
    const e = entryHost(raw);
    if (!e) continue;
    if (e.wildcard ? hostname.endsWith("." + e.host) : pageHost === e.host) return true;
  }
  return false;
}

/**
 * The page origin a widget request comes from: the Origin header, else the Referer's origin.
 * Browsers send Origin on every cross-origin fetch and every POST, but not on a same-origin
 * GET (the widget on botly.in itself calling botly.in/api/widget/config); the widget sends
 * its fetches with referrerPolicy "strict-origin" so that case still carries the origin.
 * An explicit `Origin: null` (sandboxed iframe, file://) or no header at all gives null,
 * which no allow-list matches.
 */
export function requestOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (origin !== null) return normalizeOrigin(origin);
  return normalizeOrigin(req.headers.get("referer"));
}

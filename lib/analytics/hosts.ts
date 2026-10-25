/**
 * Origins that are Botly itself, a preview host, or a developer machine.
 * A widget load or conversation on one of these is not a customer going live.
 * Kept in sync with metrics.ignored_origin in supabase/migrations/0012_analytics.sql.
 */
const EXACT = new Set(["botly.in", "www.botly.in", "localhost", "127.0.0.1"]);

/** Hostname of an origin or absolute URL, or null when it isn't an http(s) URL. */
export function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    return host || null;
  } catch {
    return null;
  }
}

export function isIgnoredAnalyticsHost(host: string | null | undefined): boolean {
  if (!host) return true;
  const h = host.toLowerCase().replace(/\.$/, "");
  if (EXACT.has(h)) return true;
  if (h.endsWith(".vercel.app")) return true;
  return false;
}

/** Customer site hostname, ignoring Botly, Vercel previews, and loopback. */
export function customerHost(value: string | null | undefined): string | null {
  const host = hostOf(value);
  if (!host || isIgnoredAnalyticsHost(host)) return null;
  return host;
}

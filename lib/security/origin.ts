/**
 * Origin allow-listing for the public widget endpoints.
 *
 * Entries in bots.allowed_origins may be:
 *   "https://shop.com"      that scheme and host; any port if the entry has none
 *   "http://localhost:3000" that scheme, host and port
 *   "shop.com"              that host and its www. twin, http or https, any port
 *   "localhost:8765"        that host and port only
 *   "*.myshopify.com"       any subdomain (not the apex), http or https
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

/** Port written in the allow-list entry, or null when the entry names only a host. */
function entryPort(entry: string): string | null {
  return /:\d+(?:\/|$)/.test(entry) ? new URL(entry.includes("://") ? entry : `http://${entry}`).port || null : null;
}

export function isOriginAllowed(origin: string | null | undefined, allowed: readonly string[]): boolean {
  const o = normalizeOrigin(origin);
  if (!o) return false;
  const page = new URL(o);
  const pageHost = page.hostname.replace(/^www\./, "");
  const pagePort = page.port || null;

  for (const entryRaw of allowed) {
    const entry = entryRaw.trim().toLowerCase().replace(/\/+$/, "");
    if (!entry) continue;
    if (entry.startsWith("*.")) {
      const base = entry.slice(2);
      if (page.hostname.endsWith("." + base) && page.hostname.length > base.length + 1) return true;
      continue;
    }
    let listed: URL;
    try {
      listed = new URL(entry.includes("://") ? entry : `http://${entry}`);
    } catch {
      continue;
    }
    if (listed.protocol !== "http:" && listed.protocol !== "https:") continue;
    // A full URL is that scheme and host exactly (www is a different host).
    // A bare host also matches its www twin, on either scheme.
    const schemeLocked = entry.includes("://");
    if (schemeLocked && listed.protocol !== page.protocol) continue;
    const listedHost = schemeLocked ? listed.hostname : listed.hostname.replace(/^www\./, "");
    const host = schemeLocked ? page.hostname : pageHost;
    if (listedHost !== host) continue;
    // No port in the entry: any port on that host. A port in the entry: that port only.
    const listedPort = entryPort(entry);
    if (listedPort === null || listedPort === pagePort) return true;
  }
  return false;
}

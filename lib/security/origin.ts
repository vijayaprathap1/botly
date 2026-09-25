/**
 * Origin allow-listing for the public widget endpoints.
 *
 * Entries in bots.allowed_origins may be:
 *   "https://shop.com"      exact origin (scheme + host + optional port)
 *   "shop.com"              that host and its www. twin, http or https
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

export function isOriginAllowed(origin: string | null | undefined, allowed: readonly string[]): boolean {
  const o = normalizeOrigin(origin);
  if (!o) return false;
  const { hostname, host } = new URL(o);

  for (const entryRaw of allowed) {
    const entry = entryRaw.trim().toLowerCase().replace(/\/+$/, "");
    if (!entry) continue;
    if (entry.startsWith("*.")) {
      const base = entry.slice(2);
      if (hostname.endsWith("." + base) && hostname.length > base.length + 1) return true;
      continue;
    }
    if (entry.includes("://")) {
      if (normalizeOrigin(entry) === o) return true;
      continue;
    }
    // Bare host (optionally with port): match with or without www.
    const bare = entry.replace(/^www\./, "");
    const target = host.replace(/^www\./, "");
    if (bare === target) return true;
  }
  return false;
}

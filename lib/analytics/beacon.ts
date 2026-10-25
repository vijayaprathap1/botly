/**
 * Cloudflare Web Analytics beacon token. The token is public (it ships in the
 * page) but it must be a boring token shape so it can't break out of the script tag.
 * Unset or invalid → the beacon is not rendered.
 */
const TOKEN = /^[A-Za-z0-9_-]{8,200}$/;

export function cloudflareBeaconToken(raw: string | null | undefined = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN): string | null {
  const token = (raw ?? "").trim();
  if (!token || !TOKEN.test(token)) return null;
  return token;
}

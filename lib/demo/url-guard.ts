import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * The demo builder fetches a URL an admin typed. Even so, the server must never be
 * talked into reading its own network (cloud metadata, localhost, private ranges):
 * every hostname is resolved first and every address it resolves to is checked, and
 * redirects are followed by hand so each hop gets the same check.
 */
export class UnsafeUrlError extends Error {}

function ipv4Parts(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n <= 255) ? p : null;
}

/** True for loopback, private, link-local, carrier-grade NAT, multicast and reserved addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ipv4Parts(ip);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // 100.64/10 carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast and reserved
    );
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (!v6.includes(":")) return true; // not an address we understand: refuse
  if (v6 === "::" || v6 === "::1") return true;
  // IPv4-mapped (::ffff:10.0.0.1) and NAT64 forms carry an IPv4 address.
  const mapped = /(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(v6);
  if (mapped) return isPrivateAddress(mapped[1]!);
  const first = parseInt(v6.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // multicast
    v6.startsWith("::ffff:") // mapped, hex form
  );
}

/** Normalises what the admin typed ("shop.com", "http://shop.com/") into a URL, or throws. */
export function parsePublicUrl(input: string): URL {
  const raw = input.trim();
  if (!raw) throw new UnsafeUrlError("Enter a website address.");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a website address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http and https websites can be copied.");
  if (url.username || url.password) throw new UnsafeUrlError("Remove the username and password from the address.");
  if (url.port && !["80", "443"].includes(url.port)) throw new UnsafeUrlError("Only standard web ports (80, 443) are allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !host.includes(":")) throw new UnsafeUrlError("Enter a full domain, like shop.com.");
  if (/\.(local|localhost|internal|lan|home|corp|test|invalid)$/i.test(host) || host === "localhost") throw new UnsafeUrlError("That address isn't on the public internet.");
  if (isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError("That address isn't on the public internet.");
  url.hash = "";
  return url;
}

type Resolver = (host: string) => Promise<string[]>;
const systemResolver: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Throws unless the URL is public http(s) and every address its host resolves to is public. */
export async function assertPublicUrl(input: string | URL, resolve: Resolver = systemResolver): Promise<URL> {
  const url = parsePublicUrl(String(input));
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return url; // already checked above
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new UnsafeUrlError(`We couldn't find ${host}. Check the address.`);
  }
  if (!addresses.length) throw new UnsafeUrlError(`We couldn't find ${host}. Check the address.`);
  if (addresses.some(isPrivateAddress)) throw new UnsafeUrlError("That address isn't on the public internet.");
  return url;
}

export type SafeFetchResult = { status: number; finalUrl: string; headers: Headers; body: string };

/**
 * GET a public page. Redirects are followed manually (each target re-checked), with a
 * time limit and a size limit on the body.
 */
export async function safeFetch(
  input: string,
  opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number; headers?: Record<string, string>; resolve?: Resolver; fetchImpl?: typeof fetch } = {},
): Promise<SafeFetchResult> {
  const { timeoutMs = 15_000, maxBytes = 3_000_000, maxRedirects = 5, fetchImpl = fetch } = opts;
  const signal = AbortSignal.timeout(timeoutMs);
  let url = await assertPublicUrl(input, opts.resolve);
  for (let hop = 0; ; hop++) {
    const res = await fetchImpl(url, { redirect: "manual", signal, headers: opts.headers });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= maxRedirects) throw new UnsafeUrlError("That address redirects too many times.");
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url), opts.resolve);
      continue;
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new UnsafeUrlError("That page is too large to copy.");
    // Read at most maxBytes even when the server doesn't say how long the body is.
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new UnsafeUrlError("That page is too large to copy.");
        }
        chunks.push(value);
      }
    }
    const bytes = Buffer.concat(chunks);
    const charset = /charset=([\w-]+)/i.exec(res.headers.get("content-type") ?? "")?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(bytes.subarray(0, 2048).toString("latin1"))?.[1] ?? "utf-8";
    let body: string;
    try {
      body = new TextDecoder(charset).decode(bytes);
    } catch {
      body = new TextDecoder("utf-8").decode(bytes);
    }
    return { status: res.status, finalUrl: url.toString(), headers: res.headers, body };
  }
}

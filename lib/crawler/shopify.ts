import { htmlToText } from "./extract";

type ShopifyVariant = { price: string; available?: boolean; option1?: string | null; option2?: string | null; option3?: string | null };
type ShopifyProduct = {
  title: string;
  handle: string;
  body_html?: string | null;
  product_type?: string;
  tags?: string[] | string;
  options?: { name: string; values: string[] }[];
  variants?: ShopifyVariant[];
};

export type CrawledProduct = { title: string; url: string; content: string };

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "AED ", SGD: "S$", AUD: "A$" };

export function formatShopifyProduct(p: ShopifyProduct, origin: string, currency: string | null): CrawledProduct {
  const sym = currency ? SYMBOL[currency] ?? `${currency} ` : "";
  const money = (v: number) => `${sym}${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const prices = (p.variants ?? []).map((v) => Number(v.price)).filter((n) => Number.isFinite(n));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const lines: string[] = [];
  if (prices.length) lines.push(`Price: ${min === max ? money(min) : `${money(min)} – ${money(max)}`}`);
  for (const o of p.options ?? []) {
    if (o.values.length && !(o.values.length === 1 && o.values[0] === "Default Title")) lines.push(`${o.name}: ${o.values.join(", ")}`);
  }
  const variants = p.variants ?? [];
  if (variants.some((v) => typeof v.available === "boolean")) {
    const avail = variants.filter((v) => v.available);
    lines.push(avail.length === 0 ? "Availability: out of stock" : avail.length === variants.length ? "Availability: in stock" : "Availability: some options in stock");
  }
  if (p.product_type) lines.push(`Type: ${p.product_type}`);
  const desc = p.body_html ? htmlToText(p.body_html).slice(0, 1500) : "";
  if (desc) lines.push(`Description: ${desc}`);
  return { title: p.title, url: `${origin}/products/${p.handle}`, content: lines.join("\n") };
}

/** Pulls public products from a Shopify store's /products.json (up to `limit`). Returns null if not Shopify. */
export async function fetchShopifyProducts(origin: string, limit = 250, timeoutMs = 10_000): Promise<CrawledProduct[] | null> {
  try {
    const res = await fetch(`${origin}/products.json?limit=${Math.min(limit, 250)}`, {
      headers: { Accept: "application/json", "User-Agent": "BotlyBot/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    const data = (await res.json()) as { products?: ShopifyProduct[] };
    if (!Array.isArray(data.products)) return null;
    let currency: string | null = null;
    try {
      const cart = await fetch(`${origin}/cart.js`, { signal: AbortSignal.timeout(5000) });
      if (cart.ok) currency = ((await cart.json()) as { currency?: string }).currency ?? null;
    } catch {
      /* currency is a nice-to-have */
    }
    return data.products.slice(0, limit).map((p) => formatShopifyProduct(p, origin, currency));
  } catch {
    return null;
  }
}

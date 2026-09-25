import type { OrderProvider, OrderRecord } from "./types";
import { cleanOrderNumber } from "./types";

/**
 * WooCommerce REST API v3 with a read-only consumer key/secret (HTTPS only).
 * Tracking comes from the common "Shipment Tracking" plugin meta when present.
 */
export class WooOrders implements OrderProvider {
  readonly name = "woocommerce" as const;
  constructor(private siteUrl: string, private key: string, private secret: string) {}

  private async get<T>(path: string): Promise<{ status: number; body: T | null }> {
    const res = await fetch(`${this.siteUrl.replace(/\/+$/, "")}/wp-json/wc/v3${path}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${this.key}:${this.secret}`).toString("base64")}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return { status: 404, body: null };
    if (!res.ok) throw new Error(`WooCommerce ${res.status}`);
    return { status: res.status, body: (await res.json()) as T };
  }

  async test() {
    await this.get("/orders?per_page=1");
  }

  async lookup(orderNumber: string): Promise<OrderRecord | null> {
    const n = cleanOrderNumber(orderNumber);
    if (!n) return null;
    type Woo = {
      id: number; number: string; status: string;
      billing: { email?: string; phone?: string }; shipping: { phone?: string };
      meta_data?: { key: string; value: unknown }[];
    };
    let order: Woo | null = null;
    if (/^\d+$/.test(n)) order = (await this.get<Woo>(`/orders/${n}`)).body;
    if (!order || String(order.number) !== n) {
      const list = (await this.get<Woo[]>(`/orders?search=${encodeURIComponent(n)}&per_page=5`)).body ?? [];
      order = list.find((o) => String(o.number) === n) ?? null;
    }
    if (!order) return null;
    const tracking = order.meta_data?.find((m) => m.key === "_wc_shipment_tracking_items")?.value as
      | { tracking_provider?: string; custom_tracking_provider?: string; tracking_number?: string; custom_tracking_link?: string }[]
      | undefined;
    const t = Array.isArray(tracking) ? tracking.at(-1) : undefined;
    const STATUS: Record<string, string> = {
      pending: "Awaiting payment", processing: "Processing", "on-hold": "On hold", completed: "Completed / shipped",
      cancelled: "Cancelled", refunded: "Refunded", failed: "Payment failed",
    };
    return {
      number: String(order.number),
      contactEmails: [order.billing?.email].filter((x): x is string => Boolean(x)),
      contactPhones: [order.billing?.phone, order.shipping?.phone].filter((x): x is string => Boolean(x)),
      status: STATUS[order.status] ?? order.status,
      carrier: t?.custom_tracking_provider || t?.tracking_provider || null,
      trackingNumber: t?.tracking_number ?? null,
      trackingUrl: t?.custom_tracking_link ?? null,
      expectedDate: null,
    };
  }
}

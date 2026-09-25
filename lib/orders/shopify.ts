import type { OrderProvider, OrderRecord } from "./types";
import { cleanOrderNumber } from "./types";

/**
 * Shopify Admin GraphQL API. Needs a custom app token with read_orders
 * (and read_all_orders for orders older than 60 days).
 */
export class ShopifyOrders implements OrderProvider {
  readonly name = "shopify" as const;
  constructor(private storeUrl: string, private token: string, private version = process.env.SHOPIFY_API_VERSION || "2025-07") {}

  private async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${this.storeUrl.replace(/\/+$/, "")}/admin/api/${this.version}/graphql.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": this.token, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Shopify ${res.status}`);
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length) throw new Error(`Shopify: ${body.errors[0]!.message}`);
    return body.data as T;
  }

  async test() {
    await this.gql<{ shop: { name: string } }>("{ shop { name } }");
  }

  async lookup(orderNumber: string): Promise<OrderRecord | null> {
    const n = cleanOrderNumber(orderNumber);
    if (!n) return null;
    type Node = {
      name: string; email: string | null; phone: string | null;
      displayFulfillmentStatus: string; cancelledAt: string | null;
      customer: { email: string | null; phone: string | null } | null;
      shippingAddress: { phone: string | null } | null;
      billingAddress: { phone: string | null } | null;
      fulfillments: { displayStatus: string | null; estimatedDeliveryAt: string | null; trackingInfo: { company: string | null; number: string | null; url: string | null }[] }[];
    };
    const data = await this.gql<{ orders: { nodes: Node[] } }>(
      `query($q: String!) { orders(first: 3, query: $q) { nodes {
        name email phone displayFulfillmentStatus cancelledAt
        customer { email phone } shippingAddress { phone } billingAddress { phone }
        fulfillments(first: 5) { displayStatus estimatedDeliveryAt trackingInfo(first: 1) { company number url } }
      } } }`,
      { q: `name:#${n} OR name:${n}` },
    );
    const o = data.orders.nodes.find((x) => cleanOrderNumber(x.name).toLowerCase() === n.toLowerCase());
    if (!o) return null;
    const f = [...(o.fulfillments ?? [])].reverse().find((x) => x.trackingInfo?.length) ?? o.fulfillments?.at(-1);
    const t = f?.trackingInfo?.[0];
    const human = (s: string | null | undefined) => (s ? s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Processing");
    return {
      number: o.name,
      contactEmails: [o.email, o.customer?.email].filter((x): x is string => Boolean(x)),
      contactPhones: [o.phone, o.customer?.phone, o.shippingAddress?.phone, o.billingAddress?.phone].filter((x): x is string => Boolean(x)),
      status: o.cancelledAt ? "Cancelled" : human(f?.displayStatus ?? o.displayFulfillmentStatus),
      carrier: t?.company ?? null,
      trackingNumber: t?.number ?? null,
      trackingUrl: t?.url ?? null,
      expectedDate: f?.estimatedDeliveryAt ? f.estimatedDeliveryAt.slice(0, 10) : null,
    };
  }
}

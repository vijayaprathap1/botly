import { isValidEmail, normalizePhone } from "../validation/phone";

/** What a store returns internally. Contact fields are used ONLY to verify the customer. */
export type OrderRecord = {
  number: string;
  contactEmails: string[];
  contactPhones: string[];
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  expectedDate: string | null;
};

/** What the visitor may see: status, carrier, tracking link, expected date. Never address or payment. */
export type OrderStatusCard = { orderNumber: string; status: string; carrier: string | null; trackingUrl: string | null; expectedDate: string | null };

export interface OrderProvider {
  readonly name: "shopify" | "woocommerce";
  lookup(orderNumber: string): Promise<OrderRecord | null>;
  /** Cheap authenticated call to check the credentials. */
  test(): Promise<void>;
}

export const cleanOrderNumber = (s: string) => s.replace(/[#\s]/g, "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);

/** The visitor's phone or email must match the order's. Phones compare on the last 10 digits. */
export function verifyCustomer(order: OrderRecord, phoneOrEmail: string): boolean {
  const v = phoneOrEmail.trim();
  if (isValidEmail(v)) return order.contactEmails.some((e) => e.trim().toLowerCase() === v.toLowerCase());
  const p = normalizePhone(v);
  const digits = (p.ok ? p.e164 : v).replace(/\D/g, "");
  if (digits.length < 8) return false;
  const tail = digits.slice(-10);
  return order.contactPhones.some((x) => {
    const d = x.replace(/\D/g, "");
    return d.length >= 8 && d.slice(-10) === tail;
  });
}

export function toCard(o: OrderRecord): OrderStatusCard {
  const url = o.trackingUrl && /^https:\/\//.test(o.trackingUrl) ? o.trackingUrl : null;
  return { orderNumber: o.number, status: o.status, carrier: o.carrier, trackingUrl: url, expectedDate: o.expectedDate };
}

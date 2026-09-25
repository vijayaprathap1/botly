import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { normalizeStoreUrl } from "@/lib/orders";
import { ShopifyOrders } from "@/lib/orders/shopify";
import { toCard, verifyCustomer, type OrderRecord } from "@/lib/orders/types";
import { WooOrders } from "@/lib/orders/woocommerce";

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

let server: http.Server;
let base = "";
const seen: { url: string; headers: http.IncomingHttpHeaders; body: string }[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      seen.push({ url: req.url!, headers: req.headers, body: b });
      res.setHeader("Content-Type", "application/json");
      if (req.url!.startsWith("/admin/api/")) {
        if (req.headers["x-shopify-access-token"] !== "shpat_good") return void res.writeHead(401).end("{}");
        const q = JSON.parse(b);
        if (q.query.includes("shop {")) return void res.end(JSON.stringify({ data: { shop: { name: "Ananya" } } }));
        const found = String(q.variables.q).includes("1042");
        return void res.end(JSON.stringify({ data: { orders: { nodes: found ? [{
          name: "#1042", email: "priya@example.in", phone: null, displayFulfillmentStatus: "FULFILLED", cancelledAt: null,
          customer: { email: "priya@example.in", phone: "+919790011223" }, shippingAddress: { phone: "97900 11223" }, billingAddress: null,
          fulfillments: [{ displayStatus: "IN_TRANSIT", estimatedDeliveryAt: "2026-10-01T10:00:00Z", trackingInfo: [{ company: "Delhivery", number: "DL123", url: "https://track.delhivery.com/DL123" }] }],
        }] : [] } } }));
      }
      if (req.url!.startsWith("/wp-json/wc/v3/orders/555")) {
        return void res.end(JSON.stringify({ id: 555, number: "555", status: "processing", billing: { email: "ravi@x.in", phone: "9884012345" }, shipping: {},
          meta_data: [{ key: "_wc_shipment_tracking_items", value: [{ tracking_provider: "Blue Dart", tracking_number: "BD9", custom_tracking_link: "https://bluedart.com/BD9" }] }] }));
      }
      if (req.url!.startsWith("/wp-json/wc/v3/orders")) return void res.end("[]");
      res.writeHead(404).end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const order: OrderRecord = {
  number: "#1042", contactEmails: ["Priya@Example.in"], contactPhones: ["+91 97900 11223"], status: "In transit",
  carrier: "Delhivery", trackingNumber: "DL1", trackingUrl: "https://t/1", expectedDate: "2026-10-01",
};

describe("orders", () => {
  it("encrypts credentials (and detects tampering)", () => {
    const blob = encryptJson({ token: "shpat_secret" });
    expect(blob).not.toContain("shpat_secret");
    expect(decryptJson(blob)).toEqual({ token: "shpat_secret" });
    const parts = blob.split(":");
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("A") ? "BB" : "AA");
    expect(() => decryptJson(parts.join(":"))).toThrow();
  });

  it("verifies the customer by email or last 10 phone digits", () => {
    expect(verifyCustomer(order, "priya@example.in")).toBe(true);
    expect(verifyCustomer(order, "9790011223")).toBe(true);
    expect(verifyCustomer(order, "+91-97900-11223")).toBe(true);
    expect(verifyCustomer(order, "someone@else.in")).toBe(false);
    expect(verifyCustomer(order, "9790011224")).toBe(false);
    expect(verifyCustomer(order, "11223")).toBe(false);
  });

  it("the visitor card has no contact details", () => {
    const card = toCard(order);
    expect(JSON.stringify(card)).not.toMatch(/priya|97900/i);
    expect(toCard({ ...order, trackingUrl: "javascript:alert(1)" }).trackingUrl).toBeNull();
  });

  it("store URLs must be https (http only on localhost)", () => {
    expect(normalizeStoreUrl("ananya.myshopify.com")).toBe("https://ananya.myshopify.com");
    expect(normalizeStoreUrl("http://ananya.com")).toBeNull();
    expect(normalizeStoreUrl("http://localhost:4000/")).toBe("http://localhost:4000");
  });

  it("Shopify: finds the order, maps fulfillment and tracking; bad token fails test()", async () => {
    const s = new ShopifyOrders(base, "shpat_good");
    await s.test();
    const o = await s.lookup("#1042");
    expect(o).toMatchObject({ number: "#1042", status: "In transit", carrier: "Delhivery", trackingUrl: "https://track.delhivery.com/DL123", expectedDate: "2026-10-01" });
    expect(o!.contactPhones).toContain("97900 11223");
    expect(await s.lookup("9999")).toBeNull();
    await expect(new ShopifyOrders(base, "shpat_bad").test()).rejects.toThrow(/401/);
  });

  it("WooCommerce: order by id with Shipment Tracking meta; basic auth", async () => {
    const w = new WooOrders(base, "ck_1", "cs_2");
    const o = await w.lookup("555");
    expect(o).toMatchObject({ number: "555", status: "Processing", carrier: "Blue Dart", trackingUrl: "https://bluedart.com/BD9" });
    expect(verifyCustomer(o!, "98840 12345")).toBe(true);
    expect(seen.at(-1)!.headers.authorization).toBe(`Basic ${Buffer.from("ck_1:cs_2").toString("base64")}`);
    expect(await w.lookup("777")).toBeNull();
  });
});

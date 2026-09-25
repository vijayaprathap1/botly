import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptJson } from "../crypto";
import { ShopifyOrders } from "./shopify";
import type { OrderProvider } from "./types";
import { WooOrders } from "./woocommerce";

export type IntegrationCreds = { token?: string; key?: string; secret?: string };

export function makeProvider(provider: "shopify" | "woocommerce", storeUrl: string, creds: IntegrationCreds): OrderProvider {
  return provider === "shopify" ? new ShopifyOrders(storeUrl, creds.token ?? "") : new WooOrders(storeUrl, creds.key ?? "", creds.secret ?? "");
}

/** The bot's order provider (service role; credentials decrypted in memory only). */
export async function loadOrderProvider(db: SupabaseClient, botId: string): Promise<OrderProvider | null> {
  const { data } = await db.from("bot_integrations").select("provider, store_url, credentials_encrypted").eq("bot_id", botId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return makeProvider(data.provider as "shopify" | "woocommerce", data.store_url as string, decryptJson<IntegrationCreds>(data.credentials_encrypted as string));
}

/** Store URLs must be https (http only for localhost testing). */
export function normalizeStoreUrl(raw: string): string | null {
  const v = raw.trim().replace(/\/+$/, "");
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
    return `${u.protocol}//${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return null;
  }
}

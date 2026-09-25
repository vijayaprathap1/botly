"use server";

import { revalidatePath } from "next/cache";
import { requireBotEditor } from "@/lib/bot-access";
import { requireAdmin } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";
import { makeProvider, normalizeStoreUrl, type IntegrationCreds } from "@/lib/orders";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ActionState } from "./actions";

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/** Growth plan: connect Shopify or WooCommerce for order lookup. Credentials are tested, then encrypted. */
export async function saveIntegration(botId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { session, bot: editable } = await requireBotEditor(botId);
  if (!session.isAdmin && editable.org.plan !== "growth") return { error: "Order lookup is part of the Growth plan. Upgrade in Billing." };
  const provider = text(form.get("provider"));
  if (provider !== "shopify" && provider !== "woocommerce") return { error: "Pick Shopify or WooCommerce" };
  const storeUrl = normalizeStoreUrl(text(form.get("store_url")));
  if (!storeUrl) return { error: "Store URL must be https://… (e.g. https://your-store.myshopify.com)" };
  const creds: IntegrationCreds =
    provider === "shopify" ? { token: text(form.get("token")) } : { key: text(form.get("key")), secret: text(form.get("secret")) };
  if (provider === "shopify" && !/^shpat_[A-Za-z0-9]{16,}$|^[A-Za-z0-9_-]{20,}$/.test(creds.token ?? "")) return { error: "Paste the Admin API access token (starts with shpat_)" };
  if (provider === "woocommerce" && (!/^ck_[a-f0-9]{20,}$/i.test(creds.key ?? "") || !/^cs_[a-f0-9]{20,}$/i.test(creds.secret ?? ""))) return { error: "Paste the consumer key (ck_…) and secret (cs_…)" };

  let status: "ok" | "error" = "ok";
  let lastError: string | null = null;
  try {
    await makeProvider(provider, storeUrl, creds).test();
  } catch (e) {
    status = "error";
    lastError = e instanceof Error ? e.message : "Connection failed";
  }
  if (status === "error") return { error: `Couldn't connect: ${lastError}. Check the URL and credentials (read-only order access).` };

  let encrypted: string;
  try {
    encrypted = encryptJson(creds);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Encryption failed: set ENCRYPTION_KEY" };
  }
  const { error } = await supabaseAdmin()
    .from("bot_integrations")
    .upsert({ bot_id: botId, provider, store_url: storeUrl, credentials_encrypted: encrypted, status, last_error: lastError, last_checked_at: new Date().toISOString() }, { onConflict: "bot_id,provider" });
  if (error) return { error: error.message };
  // One store per bot: drop the other provider if it existed.
  await supabaseAdmin().from("bot_integrations").delete().eq("bot_id", botId).neq("provider", provider);
  revalidatePath(`/app/bots/${botId}/settings`);
  return { ok: true, message: "Connected. The assistant can now look up orders (after verifying the customer)." };
}

export async function removeIntegration(botId: string) {
  const { session, bot: editable } = await requireBotEditor(botId);
  await supabaseAdmin().from("bot_integrations").delete().eq("bot_id", botId);
  revalidatePath(`/app/bots/${botId}/settings`);
}

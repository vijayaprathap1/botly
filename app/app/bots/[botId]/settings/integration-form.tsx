"use client";
import { useState } from "react";
import type { ActionState } from "@/app/app/actions";
import { removeIntegration, saveIntegration } from "@/app/app/actions-phase3";
import { SubmitButton, useFormAction } from "@/components/client";
import { Badge, btn, Card, Field, inputClass, Notice } from "@/components/ui";

type Existing = { provider: string; store_url: string; status: string; last_checked_at: string | null } | null;

export function IntegrationForm({ botId, plan, existing }: { botId: string; plan: string; existing: Existing }) {
  const [state, action, actionPending] = useFormAction<ActionState>(saveIntegration.bind(null, botId), null);
  const [provider, setProvider] = useState(existing?.provider ?? "shopify");
  return (
    <Card title="Order lookup (Growth plan)">
      {plan !== "growth" ? (
        <Notice tone="amber">Order lookup and callback booking are part of the Growth plan. Upgrade from Billing to turn them on.</Notice>
      ) : null}
      {existing ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={existing.status === "ok" ? "green" : "red"}>{existing.provider} {existing.status}</Badge>
          <span className="truncate text-slate-600">{existing.store_url}</span>
          <form action={removeIntegration.bind(null, botId)}>
            <SubmitButton className={btn.ghost} pendingText="…">Disconnect</SubmitButton>
          </form>
        </div>
      ) : null}
      <form onSubmit={action} className="grid gap-3 sm:grid-cols-2">
        <Field label="Store" htmlFor="provider">
          <select id="provider" name="provider" value={provider} onChange={(e) => setProvider(e.target.value)} className={inputClass}>
            <option value="shopify">Shopify</option>
            <option value="woocommerce">WooCommerce</option>
          </select>
        </Field>
        <Field label="Store URL" htmlFor="store_url" hint={provider === "shopify" ? "https://your-store.myshopify.com" : "https://your-site.com"}>
          <input id="store_url" name="store_url" required defaultValue={existing?.store_url ?? ""} className={inputClass} />
        </Field>
        {provider === "shopify" ? (
          <div className="sm:col-span-2">
            <Field label="Admin API access token" htmlFor="token" hint="Shopify admin → Settings → Apps → Develop apps → create an app with read_orders (and read_all_orders) → install → copy the token. Stored encrypted.">
              <input id="token" name="token" type="password" autoComplete="off" required className={inputClass} />
            </Field>
          </div>
        ) : (
          <>
            <Field label="Consumer key" htmlFor="key" hint="WooCommerce → Settings → Advanced → REST API → Add key → Read.">
              <input id="key" name="key" type="password" autoComplete="off" required className={inputClass} />
            </Field>
            <Field label="Consumer secret" htmlFor="secret">
              <input id="secret" name="secret" type="password" autoComplete="off" required className={inputClass} />
            </Field>
          </>
        )}
        <div className="sm:col-span-2">
          {state?.error ? <Notice tone="red">{state.error}</Notice> : state?.message ? <Notice tone="green">{state.message}</Notice> : null}
          <div className="mt-2">
            <SubmitButton pending={actionPending} pendingText="Testing connection…">{existing ? "Replace connection" : "Connect"}</SubmitButton>
          </div>
        </div>
      </form>
      <p className="mt-3 text-xs text-slate-500">
        Visitors only see status, courier, tracking link and expected date, and only after giving the order number plus the phone or email used on that order. Addresses and payment details are never shown.
      </p>
    </Card>
  );
}

"use client";
import type { ActionState } from "@/app/app/actions";
import { SubmitButton, useFormAction } from "@/components/client";
import { inputClass, Notice } from "@/components/ui";
import { saveBillingDetails } from "./actions";

export function BillingDetailsForm({ orgId, billingName, gstin, email }: { orgId: string; billingName: string | null; gstin: string | null; email: string | null }) {
  const [state, action, pending] = useFormAction<ActionState>(saveBillingDetails.bind(null, orgId), null);
  return (
    <form onSubmit={action} className="grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1 text-[13px] font-medium text-zinc-700">
        Business name on invoice
        <input name="billing_name" defaultValue={billingName ?? ""} maxLength={120} className={inputClass} />
      </label>
      <label className="grid gap-1 text-[13px] font-medium text-zinc-700">
        GSTIN (optional)
        <input name="gstin" defaultValue={gstin ?? ""} maxLength={15} placeholder="33ABCDE1234F1Z5" className={`${inputClass} uppercase`} />
      </label>
      <label className="grid gap-1 text-[13px] font-medium text-zinc-700">
        Billing email
        <input name="billing_email" type="email" defaultValue={email ?? ""} maxLength={200} className={inputClass} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <SubmitButton pending={pending}>Save billing details</SubmitButton>
        {state?.error ? <Notice tone="red">{state.error}</Notice> : state?.ok ? <span className="text-[13px] text-emerald-700">{state.message}</span> : null}
      </div>
    </form>
  );
}

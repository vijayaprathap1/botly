"use client";
import type { ActionState } from "@/app/app/actions";
import { inviteOwner } from "@/app/app/actions-phase2";
import { SubmitButton, useFormAction } from "@/components/client";
import { inputClass, Notice } from "@/components/ui";

export function InviteForm({ botId, orgId }: { botId: string; orgId: string }) {
  const [state, action, actionPending] = useFormAction<ActionState>(inviteOwner.bind(null, botId, orgId), null);
  return (
    <form onSubmit={action} className="grid gap-2 sm:flex sm:items-start">
      <input name="email" type="email" required placeholder="client@business.com" aria-label="Client email" className={`${inputClass} sm:max-w-xs`} />
      <SubmitButton pending={actionPending} pendingText="Inviting…">Give access</SubmitButton>
      {state?.error ? <Notice tone="red">{state.error}</Notice> : state?.message ? <Notice tone="green">{state.message}</Notice> : null}
    </form>
  );
}

"use client";
import type { ActionState } from "@/app/app/actions";
import { addAssistant } from "@/app/app/assistant-actions";
import { SubmitButton, useFormAction } from "@/components/client";
import { Field, inputClass, Notice } from "@/components/ui";

export function AddAssistantForm() {
  const [state, action, pending] = useFormAction<ActionState>(addAssistant, null);
  return (
    <form onSubmit={action} className="grid gap-4">
      <Field label="Name (only you see this)">
        <input name="name" required maxLength={80} placeholder="Wholesale website" className={inputClass} />
      </Field>
      <Field label="Website (optional)" hint="We read its public pages next. Its domain is allowed for the chat widget.">
        <input name="website" maxLength={300} placeholder="www.yourshop.com" className={inputClass} />
      </Field>
      {state?.error ? <Notice tone="red">{state.error}</Notice> : null}
      <div><SubmitButton pending={pending} pendingText="Creating…">Create and import website</SubmitButton></div>
    </form>
  );
}

"use client";
import type { ActionState } from "@/app/app/actions";
import { deleteVisitorData, updateOrgOps } from "@/app/app/actions-phase2";
import { SubmitButton, useFormAction } from "@/components/client";
import { btn, Card, Field, inputClass, Notice } from "@/components/ui";

export function OpsForms({ botId, orgId, minutes, retention }: { botId: string; orgId: string; minutes: number; retention: number }) {
  const [ops, opsAction, opsActionPending] = useFormAction<ActionState>(updateOrgOps.bind(null, botId, orgId), null);
  const [del, delAction, delActionPending] = useFormAction<ActionState>(deleteVisitorData.bind(null, botId), null);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Reports and retention">
        <form onSubmit={opsAction} className="grid gap-3">
          <Field label="Minutes of staff time saved per resolved conversation" htmlFor="minutes" hint="Used for “hours saved” in reports.">
            <input id="minutes" name="minutes" type="number" step="0.5" min={0.5} max={120} defaultValue={minutes} className={inputClass} />
          </Field>
          <Field label="Keep conversations and leads for (months)" htmlFor="retention" hint="Older data is deleted automatically every night.">
            <input id="retention" name="retention" type="number" min={1} max={120} defaultValue={retention} className={inputClass} />
          </Field>
          {ops?.error ? <Notice tone="red">{ops.error}</Notice> : ops?.message ? <Notice tone="green">{ops.message}</Notice> : null}
          <div><SubmitButton pending={opsActionPending} className={btn.secondary}>Save</SubmitButton></div>
        </form>
      </Card>
      <Card title="Delete a visitor's data">
        <form onSubmit={delAction} className="grid gap-3">
          <p className="text-sm text-zinc-600">For deletion requests. Removes every conversation and lead linked to this phone number or visitor id. This can&apos;t be undone.</p>
          <Field label="Phone number" htmlFor="del-phone">
            <input id="del-phone" name="phone" className={inputClass} placeholder="98765 43210" />
          </Field>
          <Field label="or visitor id (from a transcript)" htmlFor="del-visitor">
            <input id="del-visitor" name="visitorId" className={inputClass} />
          </Field>
          <Field label="Type DELETE to confirm" htmlFor="del-confirm">
            <input id="del-confirm" name="confirm" className={inputClass} autoComplete="off" />
          </Field>
          {del?.error ? <Notice tone="red">{del.error}</Notice> : del?.message ? <Notice tone="green">{del.message}</Notice> : null}
          <div><SubmitButton pending={delActionPending} className={btn.danger} pendingText="Deleting…">Delete data</SubmitButton></div>
        </form>
      </Card>
    </div>
  );
}

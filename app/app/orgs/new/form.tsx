"use client";
import { useState } from "react";
import { createOrgAndBot, type ActionState } from "@/app/app/actions";
import { SubmitButton, useFormAction } from "@/components/client";
import { Card, Field, inputClass, Notice } from "@/components/ui";

export function NewClientForm({ starterQuota, growthQuota }: { starterQuota: number; growthQuota: number }) {
  const [state, action, actionPending] = useFormAction<ActionState>(createOrgAndBot, null);
  const [plan, setPlan] = useState<"starter" | "growth">("starter");
  return (
    <form onSubmit={action} className="grid max-w-2xl gap-4">
      <Card title="Business">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" htmlFor="orgName">
            <input id="orgName" name="orgName" required className={inputClass} placeholder="Ananya Handlooms" />
          </Field>
          <Field label="Type of business" htmlFor="businessType" hint="Used in the assistant's introduction.">
            <input id="businessType" name="businessType" required className={inputClass} defaultValue="online store" />
          </Field>
          <Field label="Plan" htmlFor="plan">
            <select id="plan" name="plan" className={inputClass} value={plan} onChange={(e) => setPlan(e.target.value as "starter" | "growth")}>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
            </select>
          </Field>
          <Field label="Monthly conversations" htmlFor="quota">
            <input id="quota" name="quota" type="number" min={0} className={inputClass} key={plan} defaultValue={plan === "growth" ? growthQuota : starterQuota} />
          </Field>
          <Field label="Timezone" htmlFor="timezone">
            <input id="timezone" name="timezone" className={inputClass} defaultValue="Asia/Kolkata" />
          </Field>
        </div>
      </Card>
      <Card title="Assistant">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bot name (internal)" htmlFor="botName">
            <input id="botName" name="botName" required className={inputClass} defaultValue="Website assistant" />
          </Field>
          <Field label="Assistant name (shown to visitors)" htmlFor="assistantName">
            <input id="assistantName" name="assistantName" required className={inputClass} defaultValue="Assistant" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Website" htmlFor="websiteUrl" hint="Its domain is added to the allowed domains for the widget.">
              <input id="websiteUrl" name="websiteUrl" type="url" className={inputClass} placeholder="https://example.com" />
            </Field>
          </div>
        </div>
      </Card>
      {state?.error ? <Notice tone="red">{state.error}</Notice> : null}
      <div>
        <SubmitButton pending={actionPending} pendingText="Creating…">Create and continue</SubmitButton>
      </div>
    </form>
  );
}

"use client";
import { useState } from "react";
import { saveSource, type ActionState } from "@/app/app/actions";
import { SubmitButton, useFormAction } from "@/components/client";
import { Card, Field, inputClass, Notice } from "@/components/ui";
import { estimateTokens } from "@/lib/tokens";

type Source = { id: string; type: string; title: string; url: string | null; content: string; status: string };

export function SourceForm({ botId, source }: { botId: string; source: Source | null }) {
  const [state, action, actionPending] = useFormAction<ActionState>(saveSource.bind(null, botId, source?.id ?? null), null);
  const [content, setContent] = useState(source?.content ?? "");
  return (
    <form onSubmit={action}>
      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type" htmlFor="type">
            <select id="type" name="type" defaultValue={source?.type ?? "faq"} className={inputClass}>
              {["faq", "policy", "product", "note", "page", "file"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Status" htmlFor="status">
            <select id="status" name="status" defaultValue={source?.status ?? "approved"} className={inputClass}>
              <option value="approved">approved (live on next message)</option>
              <option value="draft">draft</option>
              <option value="archived">archived</option>
            </select>
          </Field>
          <Field label="URL (optional)" htmlFor="url">
            <input id="url" name="url" type="url" defaultValue={source?.url ?? ""} className={inputClass} />
          </Field>
          <div className="sm:col-span-3">
            <Field label="Title" htmlFor="title" hint="For FAQs, the question.">
              <input id="title" name="title" required defaultValue={source?.title ?? ""} className={inputClass} />
            </Field>
          </div>
          <div className="sm:col-span-3">
            <Field label="Content" htmlFor="content" hint={`About ${estimateTokens(content).toLocaleString()} tokens. Write facts plainly: prices, days, conditions.`}>
              <textarea id="content" name="content" required rows={12} value={content} onChange={(e) => setContent(e.target.value)} className={`${inputClass} font-mono text-[13px]`} />
            </Field>
          </div>
        </div>
        {state?.error ? (
          <div className="mt-3">
            <Notice tone="red">{state.error}</Notice>
          </div>
        ) : null}
        <div className="mt-4">
          <SubmitButton pending={actionPending}>Save</SubmitButton>
        </div>
      </Card>
    </form>
  );
}

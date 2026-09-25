"use client";
import { answerUnanswered, suggestAnswer } from "@/app/app/actions-phase2";
import type { ActionState } from "@/app/app/actions";
import { SubmitButton, useFormAction } from "@/components/client";
import { inputClass, Notice } from "@/components/ui";

export function AnswerForm({ botId, q, isAdmin }: { botId: string; q: { id: string; question: string; suggested_answer: string | null }; isAdmin: boolean }) {
  const [state, action, actionPending] = useFormAction<ActionState>(
    isAdmin ? answerUnanswered.bind(null, botId, q.id) : suggestAnswer.bind(null, botId, q.id),
    null,
  );
  if (state?.ok) return <div className="mt-3"><Notice tone="green">{state.message}</Notice></div>;
  return (
    <form onSubmit={action} className="mt-3 grid gap-2">
      {isAdmin ? (
        <label className="text-xs text-slate-500">
          Question as it will appear in the knowledge
          <input name="question" defaultValue={q.question} className={`${inputClass} mt-1`} />
        </label>
      ) : null}
      <textarea
        name={isAdmin ? "answer" : "suggestion"}
        rows={2}
        defaultValue={isAdmin ? q.suggested_answer ?? "" : ""}
        placeholder={isAdmin ? "The answer, in plain facts (prices, days, conditions)" : "What should the assistant say?"}
        aria-label={isAdmin ? `Answer for: ${q.question}` : `Suggest an answer for: ${q.question}`}
        className={inputClass}
      />
      {state?.error ? <Notice tone="red">{state.error}</Notice> : null}
      <div>
        <SubmitButton pending={actionPending} pendingText="Saving…">{isAdmin ? "Answer and add to knowledge" : "Suggest answer"}</SubmitButton>
      </div>
    </form>
  );
}

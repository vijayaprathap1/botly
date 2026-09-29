"use client";
import { Sparkles } from "lucide-react";
import type { ActionState } from "@/app/app/actions";
import { writeProfileFromKnowledge } from "@/app/app/profile-actions";
import { SubmitButton, useFormAction } from "@/components/client";
import { btn, Notice } from "@/components/ui";

export function WriteProfileButton({ botId }: { botId: string }) {
  const [state, action, pending] = useFormAction<ActionState>(writeProfileFromKnowledge.bind(null, botId), null);
  return (
    <form onSubmit={action} className="mt-3 grid justify-items-center gap-2">
      <SubmitButton className={btn.primary} pending={pending} pendingText="Writing…">
        <Sparkles className="h-3.5 w-3.5" />
        Write it from your knowledge
      </SubmitButton>
      {state?.error ? <Notice tone="red">{state.error}</Notice> : null}
    </form>
  );
}

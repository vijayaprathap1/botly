import Link from "next/link";
import { setUnansweredStatus } from "@/app/app/actions-phase2";
import { SubmitButton } from "@/components/client";
import { Badge, btn, Card, Empty, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { getBot } from "@/lib/dashboard";
import { fmtDateTime } from "@/lib/format";
import { LANGUAGE_LABEL, type Lang } from "@/lib/language";
import { supabaseServer } from "@/lib/supabase/server";
import { AnswerForm } from "./answer-form";

type Q = {
  id: string; question: string; language: string | null; count: number; status: string; last_asked_at: string;
  conversation_id: string | null; suggested_answer: string | null; suggested_at: string | null;
};

export default async function UnansweredPage({ params, searchParams }: { params: Promise<{ botId: string }>; searchParams: Promise<{ status?: string }> }) {
  const { botId } = await params;
  const sp = await searchParams;
  const session = await requireSession();
  const bot = await getBot(botId);
  const status = ["open", "answered", "ignored"].includes(sp.status ?? "") ? sp.status! : "open";
  const db = await supabaseServer();
  const { data } = await db
    .from("unanswered_questions")
    .select("id, question, language, count, status, last_asked_at, conversation_id, suggested_answer, suggested_at")
    .eq("bot_id", bot.id)
    .eq("status", status)
    .order("count", { ascending: false })
    .order("last_asked_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Q[];
  const base = `/app/bots/${bot.id}/unanswered`;

  return (
    <div className="grid gap-4">
      <PageHeader level={2}
        title="Unanswered questions"
        sub={session.isAdmin ? "Questions the assistant couldn't answer, grouped when similar. Answer once and it's added to the knowledge." : "Questions the assistant couldn't answer. Suggest an answer and we'll add it."}
      />
      <div className="flex gap-1.5 text-sm">
        {["open", "answered", "ignored"].map((s) => (
          <Link key={s} href={`${base}?status=${s}`} className={`rounded-full px-3 py-1 ${status === s ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
            {s}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title={status === "open" ? "Nothing waiting" : `No ${status} questions`}>{status === "open" ? "When a visitor asks something the knowledge doesn't cover, it appears here." : null}</Empty>
      ) : (
        rows.map((q) => (
          <Card key={q.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{q.question}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                  <Badge tone={q.count > 2 ? "amber" : "gray"}>asked {q.count}×</Badge>
                  {q.language ? <Badge>{LANGUAGE_LABEL[q.language as Lang] ?? q.language}</Badge> : null}
                  last {fmtDateTime(q.last_asked_at, bot.org.timezone)}
                  {q.conversation_id ? (
                    <Link className="underline" href={`/app/bots/${bot.id}/conversations/${q.conversation_id}`}>
                      see conversation
                    </Link>
                  ) : null}
                </p>
              </div>
              {session.isAdmin && q.status === "open" ? (
                <form action={setUnansweredStatus.bind(null, bot.id)}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="status" value="ignored" />
                  <SubmitButton className={btn.ghost} pendingText="…">Ignore</SubmitButton>
                </form>
              ) : session.isAdmin && q.status === "ignored" ? (
                <form action={setUnansweredStatus.bind(null, bot.id)}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="status" value="open" />
                  <SubmitButton className={btn.ghost} pendingText="…">Reopen</SubmitButton>
                </form>
              ) : null}
            </div>
            {q.suggested_answer ? (
              <p className="mt-2 rounded-lg bg-brand-50 p-2 text-sm text-brand-700">
                <b>Client suggested:</b> {q.suggested_answer}
              </p>
            ) : null}
            {q.status === "open" ? <AnswerForm botId={bot.id} q={q} isAdmin={session.isAdmin} /> : null}
          </Card>
        ))
      )}
    </div>
  );
}

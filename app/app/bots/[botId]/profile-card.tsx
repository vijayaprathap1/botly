import Link from "next/link";
import { btn, Card } from "@/components/ui";

/** The business profile document compiled at sign-up (stored on the organization and as knowledge). */
export function ProfileCard({ botId, markdown, businessName, status }: { botId: string; markdown: string | null; businessName: string; status: string }) {
  const download = markdown ? `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}` : null;
  return (
    <Card
      title="Your business profile"
      actions={
        <div className="flex gap-2 text-sm">
          <Link className="text-brand-700 underline" href={`/app/bots/${botId}/knowledge?q=Business+profile`}>Edit</Link>
          {download ? <a className="text-brand-700 underline" href={download} download={`${businessName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-profile.md`}>Download</a> : null}
        </div>
      }
    >
      {markdown ? (
        <div className="max-h-[520px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">{markdown.replace(/^#+\s*/gm, "")}</div>
      ) : (
        <div className="text-sm text-slate-600">
          {status === "running" || status === "pending" ? (
            <p>Still being written. Refresh in a minute.</p>
          ) : (
            <>
              <p>No profile yet. Import your website or add details so the assistant has facts to work from.</p>
              <Link className={`${btn.secondary} mt-3`} href={`/app/bots/${botId}/onboarding`}>Import details</Link>
            </>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">Built only from your public website and what you entered. The assistant answers from this and your other approved knowledge.</p>
    </Card>
  );
}

import Link from "next/link";
import { Download, FileText, PenLine } from "lucide-react";
import { btn, Card } from "@/components/ui";

/** Minimal, safe Markdown → React for the business profile (headings, bullets, paragraphs). */
function ProfileDoc({ markdown }: { markdown: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="my-2 list-disc space-y-1 pl-5">{list.map((l, i) => <li key={i}>{l}</li>)}</ul>);
    list = [];
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const strip = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");
    if (/^[-*]\s+/.test(line)) { list.push(strip(line.replace(/^[-*]\s+/, ""))); continue; }
    flush();
    if (/^#\s+/.test(line)) blocks.push(<h3 key={blocks.length} className="text-[16px] font-semibold tracking-[-0.01em] text-zinc-950">{strip(line.replace(/^#\s+/, ""))}</h3>);
    else if (/^#{2,}\s+/.test(line)) blocks.push(<h4 key={blocks.length} className="mt-4 text-[11.5px] font-semibold uppercase tracking-wider text-zinc-500">{strip(line.replace(/^#+\s+/, ""))}</h4>);
    else blocks.push(<p key={blocks.length} className="my-1.5">{strip(line)}</p>);
  }
  flush();
  return <div className="text-[13.5px] leading-relaxed text-zinc-700">{blocks}</div>;
}

/** The business profile document compiled at sign-up (stored on the organization and as knowledge). */
export function ProfileCard({ botId, markdown, businessName, status }: { botId: string; markdown: string | null; businessName: string; status: string }) {
  const download = markdown ? `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}` : null;
  return (
    <Card
      title="Business profile"
      sub="Built from your public pages and what you entered."
      actions={
        markdown ? (
          <div className="flex gap-1">
            <Link className={btn.ghost} href={`/app/bots/${botId}/knowledge?q=Business+profile`}><PenLine className="h-3.5 w-3.5" />Edit</Link>
            {download ? <a className={btn.ghost} href={download} download={`${businessName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-profile.md`}><Download className="h-3.5 w-3.5" />Download</a> : null}
          </div>
        ) : null
      }
    >
      {markdown ? (
        <div className="h-[540px] overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50/60 px-4 py-3"><ProfileDoc markdown={markdown} /></div>
      ) : (
        <div className="flex h-[540px] flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 text-center">
          <FileText className="h-6 w-6 text-zinc-400" />
          {status === "running" || status === "pending" ? (
            <p className="mt-2 text-[13.5px] text-zinc-600">Being written… refresh in a minute.</p>
          ) : (
            <>
              <p className="mt-2 max-w-xs text-[13.5px] text-zinc-600">No profile yet. Import your website or add details so the assistant has facts to answer from.</p>
              <Link className={`${btn.secondary} mt-3`} href={`/app/bots/${botId}/onboarding`}>Import details</Link>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

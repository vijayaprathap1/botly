import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { getBot } from "@/lib/dashboard";
import { planDef } from "@/lib/plans";

export default async function BotLayout({ children, params }: { children: React.ReactNode; params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const session = await requireSession();
  const bot = await getBot(botId);
  return (
    <>
      <div className="mb-5 print:hidden">
        {session.isAdmin ? (
          <div className="mb-2 flex items-center gap-1 text-[12.5px] text-zinc-500">
            <Link href="/app" className="hover:text-zinc-900">Assistants</Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <span className="text-zinc-700">{bot.org.name}</span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-zinc-950">{session.isAdmin ? bot.name : bot.org.name}</h1>
          <Badge tone={bot.status === "live" ? "green" : "gray"} dot>{bot.status === "live" ? "Live" : "Draft"}</Badge>
          {!bot.active ? <Badge tone="red" dot>Paused</Badge> : null}
          <Badge tone="blue">{planDef(bot.org.plan).name}</Badge>
        </div>
      </div>
      {children}
    </>
  );
}

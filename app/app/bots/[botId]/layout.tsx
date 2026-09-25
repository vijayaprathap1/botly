import Link from "next/link";
import { BotTabs } from "@/components/bot-tabs";
import { Badge } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { getBot } from "@/lib/dashboard";

export default async function BotLayout({ children, params }: { children: React.ReactNode; params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const session = await requireSession();
  const bot = await getBot(botId);
  return (
    <>
      <div className="mb-3 text-sm text-slate-500">
        <Link href="/app" className="hover:underline">
          {session.isAdmin ? "Clients" : "Assistants"}
        </Link>{" "}
        / <span className="text-slate-700">{bot.org.name}</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{bot.name}</h1>
        <Badge tone={bot.status === "live" ? "green" : "gray"}>{bot.status}</Badge>
        {!bot.active ? <Badge tone="red">inactive</Badge> : null}
        <Badge tone="blue">{bot.org.plan}</Badge>
      </div>
      <BotTabs botId={bot.id} isAdmin={session.isAdmin} />
      {children}
    </>
  );
}

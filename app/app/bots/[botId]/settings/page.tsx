import { rotateTestToken } from "@/app/app/actions";
import { SubmitButton } from "@/components/client";
import { btn, Card } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { getBot } from "@/lib/dashboard";
import { OpsForms } from "./ops-forms";
import { IntegrationForm } from "./integration-form";
import { supabaseServer } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage({ params }: { params: Promise<{ botId: string }> }) {
  const session = await requireSession();
  const { botId } = await params;
  const bot = await getBot(botId);
  const db = await supabaseServer();
  const { data: integration } = await db.from("bot_integrations").select("provider, store_url, status, last_checked_at").eq("bot_id", bot.id).maybeSingle();
  return (
    <div className="grid gap-4">
      <SettingsForm bot={bot} isAdmin={session.isAdmin} />
      <IntegrationForm botId={bot.id} plan={bot.org.plan} existing={integration} />
      <OpsForms botId={bot.id} orgId={bot.org_id} minutes={Number(bot.org.minutes_saved_per_conversation)} retention={bot.org.retention_months} />
      <Card title="Private test link">
        <p className="mb-2 text-sm text-zinc-600">If the test link leaked, make a new one. The old link stops working immediately.</p>
        <form action={rotateTestToken.bind(null, bot.id)}>
          <SubmitButton className={btn.danger} pendingText="Rotating…">Make a new test link</SubmitButton>
        </form>
      </Card>
    </div>
  );
}

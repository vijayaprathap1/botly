import { requireAdmin } from "@/lib/auth";
import { config } from "@/lib/config";
import { getBot, installSnippet } from "@/lib/dashboard";
import { Playground } from "./playground";

export default async function PlaygroundPage({ params }: { params: Promise<{ botId: string }> }) {
  await requireAdmin();
  const { botId } = await params;
  const bot = await getBot(botId);
  return (
    <Playground
      botKey={bot.public_key}
      testToken={bot.test_token}
      testUrl={`${config.appUrl}/t/${bot.test_token}`}
      snippet={installSnippet(config.appUrl, bot.public_key)}
      greeting={bot.greeting}
    />
  );
}

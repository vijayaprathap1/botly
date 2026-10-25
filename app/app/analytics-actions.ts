"use server";

import { z } from "zod";
import { loadEditableBot } from "@/lib/bot-access";
import { getSession } from "@/lib/auth";
import { track } from "@/lib/analytics/track";

/** The install-snippet Copy button. Failures stay on the server; the copy still succeeds. */
export async function trackEmbedCopied(botId: string): Promise<void> {
  try {
    if (!z.string().uuid().safeParse(botId).success) return;
    const session = await getSession();
    if (!session) return;
    const bot = await loadEditableBot(session, botId);
    if (!bot) return;
    await track({ name: "embed_code_copied", orgId: bot.org_id, botId: bot.id, properties: { bot_id: bot.id } });
  } catch (e) {
    console.error("[analytics] embed_code_copied", e instanceof Error ? e.message : e);
  }
}

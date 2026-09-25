import { isLoopback, resolveAccess } from "@/lib/chat/access";
import { SupabaseStore } from "@/lib/chat/supabase-store";
import { config } from "@/lib/config";
import { isOpenNow } from "@/lib/hours";
import { clientIp, json, preflight } from "@/lib/http";
import { effectiveQuota, monthKey } from "@/lib/quota";
import { PostgresRateLimiter } from "@/lib/security/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { configQuerySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Public widget config. When the bot is inactive, unknown or the origin isn't
 * allowed it answers 200 {enabled:false} so the widget stays silent (no console errors).
 */
export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[api/widget/config]", e instanceof Error ? e.message : e);
    return json(req, { enabled: false }, 200, { "Cache-Control": "no-store" });
  }
}

async function handle(req: Request) {
  const url = new URL(req.url);
  const parsed = configQuerySchema.safeParse({ key: url.searchParams.get("key"), testToken: url.searchParams.get("t") });
  // Local testing only: tell a developer on localhost WHY the widget is off. Client sites get no detail.
  const origin = req.headers.get("origin");
  const devPage = isLoopback(origin);
  const off = (reason?: string) =>
    json(req, devPage && reason ? { enabled: false, reason, origin } : { enabled: false }, 200, { "Cache-Control": devPage ? "no-store" : "private, max-age=60" });
  if (!parsed.success) return off();

  const db = supabaseAdmin();
  const ip = clientIp(req);
  if (ip) {
    const r = await new PostgresRateLimiter(db).hit(`cfg:${ip}`, 120, 60);
    if (!r.allowed) return off();
  }
  const store = new SupabaseStore(db);
  const bot = await store.getBotByKey(parsed.data.key);
  if (!bot) return off("unknown_key");
  const access = resolveAccess(bot, req.headers.get("origin"), parsed.data.testToken);
  if (!access.allowed) return off(access.reason);

  const month = monthKey(new Date(), bot.org.timezone);
  const used = access.isTest ? 0 : await store.getUsedConversations(bot.id, month);
  const quota = effectiveQuota(bot.org.monthly_conversation_quota, bot.monthly_conversation_quota);

  return json(
    req,
    {
      enabled: true,
      test: access.isTest,
      business: bot.org.name,
      assistantName: bot.branding.assistant_name || "Assistant",
      avatarUrl: bot.branding.avatar_url,
      primaryColor: bot.branding.primary_color,
      position: bot.branding.position,
      theme: bot.branding.theme,
      showPoweredBy: bot.branding.show_powered_by,
      greeting: bot.greeting,
      nudge: bot.nudge,
      suggestions: bot.suggested_questions.slice(0, 4),
      isOpen: isOpenNow(bot.business_hours, bot.org.timezone),
      privacyUrl: bot.privacy_url ?? `${config.appUrl}/privacy`,
      fallbackContact: bot.fallback_contact,
      quotaExceeded: used >= quota,
    },
    200,
    { "Cache-Control": "private, max-age=60" },
  );
}

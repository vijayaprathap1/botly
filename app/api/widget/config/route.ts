import { resolveAccess } from "@/lib/chat/access";
import { SupabaseStore } from "@/lib/chat/supabase-store";
import { config } from "@/lib/config";
import { isOpenNow } from "@/lib/hours";
import { clientIp, json, preflight } from "@/lib/http";
import { effectiveQuota, monthKey, replyGateFromOrg } from "@/lib/quota";
import { PostgresRateLimiter } from "@/lib/security/rate-limit";
import { requestOrigin } from "@/lib/security/origin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { configQuerySchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Public widget config. When the bot is inactive, unknown or the origin isn't
 * allowed it answers 200 {enabled:false, reason} so the widget shows nothing and logs one
 * console warning saying why (domain not allowed, bot paused or draft, wrong key).
 * The reason is safe to show anywhere: it names the page's own origin and a fixed code.
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
  const origin = requestOrigin(req);
  // Not cached, so fixing the allowed domains or switching the bot on shows up on the next load.
  // A page that isn't on the bot's allowed domains (or a bad test token) gets 403; an unknown
  // key 404; a bot that is switched off or still a draft 200 {enabled:false}.
  const status = (reason?: string) => (reason === "origin" || reason === "bad_token" ? 403 : reason === "unknown_key" ? 404 : 200);
  const off = (reason?: string) => json(req, reason ? { enabled: false, reason, origin } : { enabled: false }, status(reason), { "Cache-Control": "no-store" });
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
  const access = resolveAccess(bot, origin, parsed.data.testToken);
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
      // An ended trial, a used-up trial or a suspended account shows the "paused" card on open
      // (the org row is already loaded, so this costs no extra query).
      quotaExceeded: used >= quota || replyGateFromOrg(bot.org) !== "ok",
    },
    200,
    { "Cache-Control": "private, max-age=60" },
  );
}

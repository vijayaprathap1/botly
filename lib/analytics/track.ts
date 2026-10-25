import "server-only";
import { supabaseAdmin } from "../supabase/admin";

export const ANALYTICS_EVENTS = [
  "sign_up",
  "business_profile_created",
  "bot_build_started",
  "bot_build_completed",
  "embed_code_copied",
  "widget_first_load",
  "bot_live",
  "lead_captured",
  "trial_limit_reached",
  "checkout_started",
  "subscription_activated",
  "payment_failed",
  "subscription_cancelled",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export type TrackInput = {
  name: AnalyticsEventName;
  orgId?: string | null;
  botId?: string | null;
  properties?: Record<string, unknown>;
  occurredAt?: Date;
};

export type AnalyticsRow = {
  event_name: string;
  org_id: string | null;
  bot_id: string | null;
  occurred_at: string;
  properties: Record<string, unknown>;
};

export type AnalyticsWriteError = { code?: string; message: string } | null;
export type AnalyticsWriter = (row: AnalyticsRow) => Promise<AnalyticsWriteError>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-z0-9_]{0,39}$/i;

/** Stop calling Supabase for the rest of this process when the table isn't there yet. */
let unavailable = false;

function uuidOrNull(value: string | null | undefined): string | null {
  return value && UUID.test(value) ? value : null;
}

export function cleanProperties(input: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (!KEY.test(key) || Object.keys(out).length >= 30) continue;
    if (value == null) {
      out[key] = null;
      continue;
    }
    if (typeof value === "string") {
      out[key] = value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 500);
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
      continue;
    }
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

export function toAnalyticsRow(input: TrackInput): AnalyticsRow {
  return {
    event_name: input.name,
    org_id: uuidOrNull(input.orgId),
    bot_id: uuidOrNull(input.botId),
    occurred_at: (input.occurredAt ?? new Date()).toISOString(),
    properties: cleanProperties(input.properties),
  };
}

const MISSING = /analytics_events|schema cache|does not exist|could not find the table|column .* does not exist/i;

/**
 * Wait up to `ms` for analytics work. On timeout or rejection the caller gets
 * undefined and the user-facing request continues. The original promise is left
 * to settle on its own.
 */
export function quietDeadline<T>(work: PromiseLike<T>, ms = 1000): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    Promise.resolve(work).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

export type DeliverResult = "ok" | "duplicate" | "timeout" | "unavailable" | "error";

/**
 * Insert one event. Never throws. A hung write gives up after `timeoutMs` so a
 * signup, a chat reply, or a webhook is not stuck on analytics.
 */
export async function deliverAnalyticsEvent(write: AnalyticsWriter, input: TrackInput, timeoutMs = 1000): Promise<DeliverResult> {
  const row = toAnalyticsRow(input);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
  });
  const attempt = write(row).then(
    (error) => ({ error }),
    (e: unknown) => ({ error: { message: e instanceof Error ? e.message : String(e) } as AnalyticsWriteError }),
  );
  try {
    const result = await Promise.race([attempt, timeout]);
    if (!result) return "timeout";
    if (!result.error) return "ok";
    if (result.error.code === "23505") return "duplicate";
    if (MISSING.test(result.error.message)) return "unavailable";
    console.error("[analytics]", input.name, result.error.message);
    return "error";
  } catch (e) {
    console.error("[analytics]", input.name, e instanceof Error ? e.message : e);
    return "error";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Record a growth event with the service role. Failures are logged and swallowed.
 * Safe to await on a user-facing path: it returns immediately when analytics isn't
 * configured, and it won't wait more than a second on a slow database.
 */
export async function track(input: TrackInput): Promise<void> {
  if (unavailable || !configured()) return;
  try {
    const db = supabaseAdmin();
    const status = await deliverAnalyticsEvent(async (row) => {
      const { error } = await db.from("analytics_events").insert(row);
      if (!error) return null;
      return { code: error.code, message: error.message };
    }, input);
    if (status === "unavailable") unavailable = true;
  } catch (e) {
    console.error("[analytics]", input.name, e instanceof Error ? e.message : e);
  }
}

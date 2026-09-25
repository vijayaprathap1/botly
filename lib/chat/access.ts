import { timingSafeEqual } from "node:crypto";
import { isOriginAllowed, normalizeOrigin } from "../security/origin";
import type { BotRow } from "../types";

export type Access =
  | { allowed: true; isTest: boolean }
  | { allowed: false; reason: "origin" | "inactive" | "not_live" | "bad_token" };

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function isLoopback(origin: string | null): boolean {
  const o = normalizeOrigin(origin);
  if (!o) return false;
  const h = new URL(o).hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

/**
 * Who may talk to a bot:
 *  - Private test link / playground (valid test token): always, even draft or inactive.
 *  - Embedded widget: Origin must be in allowed_origins, bot must be active, and
 *    live — except on localhost, so you can try the script tag on a local page before launch.
 */
export function resolveAccess(
  bot: Pick<BotRow, "test_token" | "allowed_origins" | "active" | "status">,
  origin: string | null,
  testToken?: string | null,
): Access {
  if (testToken) return safeEqual(testToken, bot.test_token) ? { allowed: true, isTest: true } : { allowed: false, reason: "bad_token" };
  if (!isOriginAllowed(origin, bot.allowed_origins)) return { allowed: false, reason: "origin" };
  if (!bot.active) return { allowed: false, reason: "inactive" };
  if (bot.status !== "live" && !isLoopback(origin)) return { allowed: false, reason: "not_live" };
  return { allowed: true, isTest: false };
}

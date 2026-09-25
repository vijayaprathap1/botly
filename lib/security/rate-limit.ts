import type { SupabaseClient } from "@supabase/supabase-js";

export type LimitResult = { allowed: boolean; count: number; resetAt: Date };
export interface RateLimiter {
  hit(key: string, limit: number, windowSeconds: number): Promise<LimitResult>;
}

/** Atomic fixed-window limiter in Postgres (see rate_limit_hit in 0002_functions.sql). */
export class PostgresRateLimiter implements RateLimiter {
  constructor(private db: SupabaseClient) {}
  async hit(key: string, limit: number, windowSeconds: number): Promise<LimitResult> {
    const { data, error } = await this.db.rpc("rate_limit_hit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      // Fail open: a limiter outage must not take every client's widget down.
      console.error("[rate-limit] rpc failed", error.message);
      return { allowed: true, count: 0, resetAt: new Date() };
    }
    const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; current_count: number; reset_at: string };
    return { allowed: row.allowed, count: row.current_count, resetAt: new Date(row.reset_at) };
  }
}

/** Same semantics in memory (tests, local scripts). */
export class MemoryRateLimiter implements RateLimiter {
  private windows = new Map<string, number>();
  constructor(private now: () => number = Date.now) {}
  async hit(key: string, limit: number, windowSeconds: number): Promise<LimitResult> {
    const w = Math.floor(this.now() / 1000 / windowSeconds) * windowSeconds;
    const k = `${key}@${w}`;
    const count = (this.windows.get(k) ?? 0) + 1;
    this.windows.set(k, count);
    return { allowed: count <= limit, count, resetAt: new Date((w + windowSeconds) * 1000) };
  }
}

export type LimitRule = { key: string; limit: number; windowSeconds: number; reason: string };

/** Checks rules in order; returns the first one that blocks, or null. */
export async function checkLimits(limiter: RateLimiter, rules: LimitRule[]): Promise<(LimitRule & LimitResult) | null> {
  const results = await Promise.all(rules.map((r) => limiter.hit(r.key, r.limit, r.windowSeconds)));
  for (let i = 0; i < rules.length; i++) {
    if (!results[i]!.allowed) return { ...rules[i]!, ...results[i]! };
  }
  return null;
}

/**
 * Global AI budget shared by every bot. Defaults sit under Groq's Developer
 * tier (250k tokens/minute per model, no daily cap) so one bot cannot take
 * the whole account. Enforced in Postgres when migration 0011 is applied;
 * if that function is missing, calls proceed and a single warning is logged.
 */

export type BudgetLimits = { rpm: number; tpm: number; rpd: number; tpd: number };
export type BudgetReason = "ok" | "minute" | "day";

export class AiBudgetError extends Error {
  readonly reason: "minute" | "day";
  constructor(reason: "minute" | "day") {
    super(`LLM API 429: AI budget exceeded (${reason})`);
    this.name = "AiBudgetError";
    this.reason = reason;
  }
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), 2_000_000_000);
}

/** 0 on any field means that window is not capped. */
export function budgetLimits(): BudgetLimits {
  return {
    rpm: envInt("AI_BUDGET_REQUESTS_PER_MIN", 40),
    tpm: envInt("AI_BUDGET_TOKENS_PER_MIN", 200_000),
    rpd: envInt("AI_BUDGET_REQUESTS_PER_DAY", 10_000),
    tpd: envInt("AI_BUDGET_TOKENS_PER_DAY", 15_000_000),
  };
}

/** Extra tokens an onboarding draft must see free so it does not take the last chat slots. */
export function onboardingReserveTokens(): number {
  return envInt("AI_BUDGET_ONBOARDING_RESERVE", 25_000);
}

export function estimateRequestTokens(body: unknown, maxTokens: number): number {
  let chars = 0;
  try {
    chars = JSON.stringify(body).length;
  } catch {
    chars = 4_000;
  }
  return Math.max(500, Math.ceil(chars / 4) + Math.max(0, maxTokens));
}

/** Pure decision mirrored by ai_budget_try. Minute windows are checked before the day. */
export function budgetDecision(
  current: BudgetLimits,
  add: { requests: number; tokens: number },
  limits: BudgetLimits,
): BudgetReason {
  if (limits.rpm > 0 && current.rpm + add.requests > limits.rpm) return "minute";
  if (limits.tpm > 0 && current.tpm + add.tokens > limits.tpm) return "minute";
  if (limits.rpd > 0 && current.rpd + add.requests > limits.rpd) return "day";
  if (limits.tpd > 0 && current.tpd + add.tokens > limits.tpd) return "day";
  return "ok";
}

type TryResult = BudgetReason | "skip";

let loggedSkip = false;
const reservations = new WeakMap<Response, number>();

function configured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return url.startsWith("http") && key.length > 20;
}

function logSkip(message: string) {
  if (loggedSkip) return;
  loggedSkip = true;
  console.error("[llm] AI budget not enforced:", message);
}

async function rpcTry(requests: number, tokens: number, limits: BudgetLimits): Promise<TryResult> {
  if (!configured() || (limits.rpm === 0 && limits.tpm === 0 && limits.rpd === 0 && limits.tpd === 0)) return "skip";
  try {
    const { supabaseAdmin } = await import("../supabase/admin");
    const { data, error } = await supabaseAdmin().rpc("ai_budget_try", {
      p_requests: requests,
      p_tokens: tokens,
      p_rpm: limits.rpm,
      p_tpm: limits.tpm,
      p_rpd: limits.rpd,
      p_tpd: limits.tpd,
    });
    if (error) {
      logSkip(error.message);
      return "skip";
    }
    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; reason?: string } | null;
    if (!row || row.allowed) return "ok";
    return row.reason === "day" ? "day" : "minute";
  } catch (e) {
    logSkip(e instanceof Error ? e.message : String(e));
    return "skip";
  }
}

/**
 * Reserve one request and `tokens` against the global budget.
 * Returns the reserved token count (0 when the budget is not in force).
 * `waitMs` lets a long onboarding call pause for the per-minute window
 * instead of failing the import. A daily cap never waits.
 */
export async function acquireAiBudget(opts: { tokens: number; waitMs?: number }): Promise<number> {
  const limits = budgetLimits();
  const tokens = Math.max(1, Math.floor(opts.tokens));
  const deadline = Date.now() + Math.max(0, opts.waitMs ?? 0);
  let announced = false;
  for (;;) {
    const result = await rpcTry(1, tokens, limits);
    if (result === "ok" || result === "skip") return result === "ok" ? tokens : 0;
    if (result === "day" || Date.now() >= deadline) throw new AiBudgetError(result === "day" ? "day" : "minute");
    if (!announced) {
      announced = true;
      console.warn(`[llm] AI budget low this minute; waiting up to ${Math.ceil((deadline - Date.now()) / 1000)}s`);
    }
    const sleepMs = Math.min(5_000, deadline - Date.now());
    if (sleepMs <= 0) throw new AiBudgetError("minute");
    await new Promise((r) => setTimeout(r, sleepMs));
  }
}

/** Add a signed delta to the current windows (reconcile a reservation, or give tokens back). */
export async function adjustAiBudget(tokensDelta: number, requestsDelta = 0): Promise<void> {
  if (!tokensDelta && !requestsDelta) return;
  if (!configured()) return;
  try {
    const { supabaseAdmin } = await import("../supabase/admin");
    const { error } = await supabaseAdmin().rpc("ai_budget_add", {
      p_requests: Math.trunc(requestsDelta),
      p_tokens: Math.trunc(tokensDelta),
    });
    if (error) logSkip(error.message);
  } catch (e) {
    logSkip(e instanceof Error ? e.message : String(e));
  }
}

export function holdReservation(res: Response, tokens: number) {
  if (tokens > 0) reservations.set(res, tokens);
}

/** Replace the reserved estimate with the real token count for this response. */
export async function noteAiUsage(res: Response, actualTokens: number): Promise<void> {
  const reserved = reservations.get(res);
  if (reserved == null) return;
  reservations.delete(res);
  const delta = Math.floor(actualTokens) - reserved;
  if (delta !== 0) await adjustAiBudget(delta);
}

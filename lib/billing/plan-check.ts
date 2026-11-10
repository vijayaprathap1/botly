import { razorpayPlanIds } from "../plans";
import { fetchPlan, planMismatch, razorpayConfigured, razorpayMode } from "./razorpay";

export type PlanCheck = { env: string; id: string | null; expectInr: number; period: "monthly" | "yearly"; ok: boolean | null; problem?: string };

let cache: { at: number; mode: string; plans: PlanCheck[] } | null = null;
const TTL_MS = 10 * 60_000;

/**
 * Every Razorpay plan id in env, fetched server-side and compared with the price on the
 * site (same rule checkout uses). Plan ids and prices are public; no key or secret is
 * returned. Cached per instance for 10 minutes so the health URL can't hammer Razorpay.
 */
export async function checkRazorpayPlans(now = Date.now()): Promise<{ mode: string; plans: PlanCheck[] } | null> {
  if (!razorpayConfigured()) return null;
  if (cache && now - cache.at < TTL_MS) return { mode: cache.mode, plans: cache.plans };
  const plans = await Promise.all(
    razorpayPlanIds().map(async (p): Promise<PlanCheck> => {
      const base = { env: p.env, id: p.id ?? null, expectInr: p.amountInr, period: p.interval };
      if (!p.id) return { ...base, ok: null, problem: "not set" };
      try {
        const problem = planMismatch(await fetchPlan(p.id), { amountInr: p.amountInr, yearly: p.interval === "yearly" });
        return problem ? { ...base, ok: false, problem } : { ...base, ok: true };
      } catch (e) {
        return { ...base, ok: false, problem: (e instanceof Error ? e.message : String(e)).slice(0, 120) };
      }
    }),
  );
  cache = { at: now, mode: razorpayMode(), plans };
  return { mode: cache.mode, plans };
}

export const resetPlanCheckCache = () => void (cache = null);

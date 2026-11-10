import type { BillingInterval, Plan } from "./types";

/**
 * Botly plans (flat INR, exactly what the customer pays).
 *
 * Prices shown on the site must match the plans created in Razorpay (Dashboard →
 * Subscriptions → Plans). Razorpay plan ids are never hard-coded: each paid tier reads
 * them from env (see `razorpayPlanEnv` / `razorpayYearlyEnv` / FOUNDING.razorpayPlanEnv).
 *
 * Cost check (a typical 5k-token knowledge base cached): ~₹0.5–1 per conversation at the
 * worst case; most businesses use well under their quota.
 */
export type PlanDef = {
  id: Plan;
  name: string;
  priceInr: number; // per month
  yearlyInr: number; // per year (10 × monthly: two months free)
  conversations: number; // per month, per assistant (usage_monthly is counted per bot)
  bots: number;
  crawlPages: number;
  growthTools: boolean; // order lookup (Shopify/WooCommerce), callback booking, weekly summary
  hideBranding: boolean; // may turn off "Powered by Botly"
  razorpayPlanEnv?: string;
  razorpayYearlyEnv?: string;
  blurb: string;
  features: string[];
};

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** Standard free trial (admin-granted; sign-up starts on Free). Unchanged from before. */
export const TRIAL = {
  days: num("TRIAL_DAYS", 14),
  replies: num("TRIAL_REPLIES", 50),
  crawlPages: num("TRIAL_CRAWL_PAGES", 15),
};

/** Pilot: a longer trial with free setup, granted by the super admin. */
export const PILOT = {
  days: num("PILOT_DAYS", 30),
  replies: num("PILOT_REPLIES", 500),
};

/** One-off pack: more conversations for the current calendar month. */
export const TOPUP = {
  priceInr: num("TOPUP_PRICE_INR", 249),
  conversations: num("TOPUP_CONVERSATIONS", 500),
};

/** Founding offer: the first 25 shops get Growth at ₹999/month, locked for 12 months. */
export const FOUNDING = {
  plan: "growth" as const,
  priceInr: num("FOUNDING_PRICE_INR", 999),
  slots: num("FOUNDING_SLOTS", 25),
  lockMonths: 12,
  razorpayPlanEnv: "RAZORPAY_PLAN_GROWTH_FOUNDING",
};

const yearly = (monthly: number) => monthly * 10;
const n = (v: number) => v.toLocaleString("en-IN");

export function plans(): Record<Plan, PlanDef> {
  const free = num("DEFAULT_QUOTA_FREE", 50);
  const starter = num("DEFAULT_QUOTA_STARTER", 500);
  const growth = num("DEFAULT_QUOTA_GROWTH", 2000);
  const pro = num("DEFAULT_QUOTA_PRO", 10000);
  const pStarter = num("PRICE_STARTER_INR", 799);
  const pGrowth = num("PRICE_GROWTH_INR", 1999);
  const pPro = num("PRICE_PRO_INR", 4999);
  return {
    trial: {
      id: "trial", name: "Free trial", priceInr: 0, yearlyInr: 0, conversations: TRIAL.replies, bots: 1, crawlPages: TRIAL.crawlPages, growthTools: false, hideBranding: false,
      blurb: `${TRIAL.replies} AI replies over ${TRIAL.days} days`,
      features: ["Assistant trained on your website", "Preview and install on your site", "Leads by email"],
    },
    free: {
      id: "free", name: "Free", priceInr: 0, yearlyInr: 0, conversations: free, bots: 1, crawlPages: num("FREE_CRAWL_PAGES", 10), growthTools: false, hideBranding: false,
      blurb: "Try Botly on your site, free for ever",
      features: [`${n(free)} conversations a month`, "English, Tamil, Hindi, Tanglish, Hinglish", "Leads by email", "\"Powered by Botly\" on the widget"],
    },
    starter: {
      id: "starter", name: "Starter", priceInr: pStarter, yearlyInr: yearly(pStarter), conversations: starter, bots: 1, crawlPages: 40, growthTools: false, hideBranding: false,
      razorpayPlanEnv: "RAZORPAY_PLAN_STARTER", razorpayYearlyEnv: "RAZORPAY_PLAN_STARTER_YEARLY",
      blurb: "For a shop or clinic getting started",
      features: [`${n(starter)} conversations a month`, "Everything in Free", "Leads by email, one-tap WhatsApp reply", "Unanswered-questions inbox", "Monthly report"],
    },
    growth: {
      id: "growth", name: "Growth", priceInr: pGrowth, yearlyInr: yearly(pGrowth), conversations: growth, bots: 1, crawlPages: 40, growthTools: true, hideBranding: true,
      razorpayPlanEnv: "RAZORPAY_PLAN_GROWTH", razorpayYearlyEnv: "RAZORPAY_PLAN_GROWTH_YEARLY",
      blurb: "For stores with online orders",
      features: [`${n(growth)} conversations a month`, "Everything in Starter", "Order-status lookup (Shopify, WooCommerce)", "Callback booking", "Weekly summary email", "No Botly branding"],
    },
    pro: {
      id: "pro", name: "Pro", priceInr: pPro, yearlyInr: yearly(pPro), conversations: pro, bots: 3, crawlPages: 100, growthTools: true, hideBranding: true,
      razorpayPlanEnv: "RAZORPAY_PLAN_PRO", razorpayYearlyEnv: "RAZORPAY_PLAN_PRO_YEARLY",
      blurb: "For busy stores and multiple brands",
      features: [`${n(pro)} conversations a month`, "Everything in Growth", "Up to 3 assistants", "Learns up to 100 pages"],
    },
  };
}

export const isPlan = (v: unknown): v is Plan => v === "trial" || v === "free" || v === "starter" || v === "growth" || v === "pro";
/** Unknown values (an old row, a typo) fall back to Free rather than throwing. */
export const planDef = (p: Plan | string) => plans()[isPlan(p) ? p : "free"];
export const PAID_PLANS = ["starter", "growth", "pro"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export const isPaidPlan = (v: unknown): v is PaidPlan => v === "starter" || v === "growth" || v === "pro";
export const paidPlans = () => PAID_PLANS.map((p) => plans()[p]);
/** Order lookup, callback booking and the weekly summary (Growth and Pro). */
export const hasGrowthTools = (p: Plan | string) => planDef(p).growthTools;
export const canHideBranding = (p: Plan | string) => planDef(p).hideBranding;
/** The smallest paid plan that has order lookup, for upgrade prompts. */
export const growthToolsPlan = () => plans().growth;
export const fmtInr = (v: number) => `₹${v.toLocaleString("en-IN")}`;

/** Env var holding the Razorpay plan id for this plan and billing interval. */
export const razorpayPlanEnv = (p: PaidPlan, interval: BillingInterval = "monthly") =>
  (interval === "yearly" ? plans()[p].razorpayYearlyEnv : plans()[p].razorpayPlanEnv)!;

/** Every Razorpay plan id we sell, read from env: plan id → our plan, interval, founding. */
export function razorpayPlanIds(): { env: string; id: string | undefined; plan: PaidPlan; interval: BillingInterval; founding: boolean; amountInr: number }[] {
  const out: { env: string; id: string | undefined; plan: PaidPlan; interval: BillingInterval; founding: boolean; amountInr: number }[] = [];
  for (const p of PAID_PLANS) {
    const d = plans()[p];
    out.push({ env: d.razorpayPlanEnv!, id: process.env[d.razorpayPlanEnv!] || undefined, plan: p, interval: "monthly", founding: false, amountInr: d.priceInr });
    out.push({ env: d.razorpayYearlyEnv!, id: process.env[d.razorpayYearlyEnv!] || undefined, plan: p, interval: "yearly", founding: false, amountInr: d.yearlyInr });
  }
  out.push({ env: FOUNDING.razorpayPlanEnv, id: process.env[FOUNDING.razorpayPlanEnv] || undefined, plan: FOUNDING.plan, interval: "monthly", founding: true, amountInr: FOUNDING.priceInr });
  return out;
}

export const foundingConfigured = () => Boolean(process.env[FOUNDING.razorpayPlanEnv]);

export function trialState(org: { plan: Plan; trial_ends_at?: string | null; trial_reply_limit?: number; trial_replies_used?: number }, now = new Date()) {
  if (org.plan !== "trial") return null;
  const ends = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
  const daysLeft = ends ? Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / 86_400_000)) : TRIAL.days;
  const limit = org.trial_reply_limit ?? TRIAL.replies;
  const used = org.trial_replies_used ?? 0;
  const expired = Boolean(ends && ends < now);
  return { daysLeft, used, limit, left: Math.max(0, limit - used), expired, exhausted: used >= limit, over: expired || used >= limit };
}

/** Monthly conversation cap for one assistant, including top-up packs bought for `month`. */
export function monthlyCap(baseQuota: number, org: { topup_month?: string | null; topup_conversations?: number | null }, month: string): number {
  const extra = org.topup_month && org.topup_month.slice(0, 10) === month ? Math.max(0, org.topup_conversations ?? 0) : 0;
  return baseQuota + extra;
}

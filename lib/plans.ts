import type { Plan } from "./types";

/**
 * Self-serve plans. Prices are shown on the pricing page and must match the plans
 * you create in Razorpay (Dashboard → Subscriptions → Plans); the Razorpay plan ids
 * go in RAZORPAY_PLAN_STARTER / RAZORPAY_PLAN_GROWTH.
 *
 * Cost check (Claude Haiku 4.5, a typical 5k-token knowledge base cached):
 * ~₹0.15–0.35 per reply, ~3 replies per conversation → ~₹0.5–1 per conversation.
 * Most businesses use well under their quota; set prices with that range in mind.
 */
export type PlanDef = {
  id: Plan;
  name: string;
  priceInr: number; // per month, GST extra
  conversations: number; // per month
  bots: number;
  crawlPages: number;
  growthTools: boolean; // order lookup, callback booking, weekly report
  razorpayPlanEnv?: string;
  blurb: string;
  features: string[];
};

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const TRIAL = {
  days: num("TRIAL_DAYS", 14),
  replies: num("TRIAL_REPLIES", 50),
  crawlPages: num("TRIAL_CRAWL_PAGES", 15),
};

export function plans(): Record<Plan, PlanDef> {
  return {
    trial: {
      id: "trial", name: "Free trial", priceInr: 0, conversations: TRIAL.replies, bots: 1, crawlPages: TRIAL.crawlPages, growthTools: false,
      blurb: `${TRIAL.replies} AI replies over ${TRIAL.days} days`,
      features: ["Assistant trained on your website", "Preview and install on your site", "Leads by email"],
    },
    starter: {
      id: "starter", name: "Starter", priceInr: num("PRICE_STARTER_INR", 2999), conversations: num("DEFAULT_QUOTA_STARTER", 2000), bots: 1, crawlPages: 40, growthTools: false,
      razorpayPlanEnv: "RAZORPAY_PLAN_STARTER",
      blurb: "For a shop or clinic getting started",
      features: ["2,000 conversations a month", "English, Tamil, Hindi, Hinglish", "Leads to email and WhatsApp", "Unanswered-questions inbox", "Monthly report"],
    },
    growth: {
      id: "growth", name: "Growth", priceInr: num("PRICE_GROWTH_INR", 9999), conversations: num("DEFAULT_QUOTA_GROWTH", 10000), bots: 3, crawlPages: 100, growthTools: true,
      razorpayPlanEnv: "RAZORPAY_PLAN_GROWTH",
      blurb: "For busy stores with online orders",
      features: ["10,000 conversations a month", "Everything in Starter", "Order-status lookup (Shopify, WooCommerce)", "Callback booking", "Weekly summary email", "Up to 3 assistants"],
    },
  };
}

export const planDef = (p: Plan) => plans()[p];
export const paidPlans = () => [plans().starter, plans().growth];
export const fmtInr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function trialState(org: { plan: Plan; trial_ends_at?: string | null; trial_reply_limit?: number; trial_replies_used?: number }, now = new Date()) {
  if (org.plan !== "trial") return null;
  const ends = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
  const daysLeft = ends ? Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / 86_400_000)) : TRIAL.days;
  const limit = org.trial_reply_limit ?? TRIAL.replies;
  const used = org.trial_replies_used ?? 0;
  const expired = Boolean(ends && ends < now);
  return { daysLeft, used, limit, left: Math.max(0, limit - used), expired, exhausted: used >= limit, over: expired || used >= limit };
}

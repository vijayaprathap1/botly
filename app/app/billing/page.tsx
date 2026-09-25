import { redirect } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { fmtInr, paidPlans, planDef, TRIAL, trialState } from "@/lib/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OrgRow } from "@/lib/types";
import { PlanButtons } from "./plan-buttons";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const session = await requireSession();
  if (!session.orgIds.length) redirect(session.isAdmin ? "/app/admin" : "/start");
  const orgId = session.orgIds[0]!;
  const { data } = await supabaseAdmin().from("organizations").select("*").eq("id", orgId).single();
  const org = data as OrgRow & { razorpay_subscription_id: string | null };
  const trial = trialState(org);
  const current = planDef(org.plan);
  const statusLabel: Record<string, string> = {
    none: "No subscription", trialing: "Free trial", pending: "Waiting for payment", active: "Active", past_due: "Payment failed, retrying",
    halted: "Stopped: payment failed", cancelled: "Cancelled", expired: "Ended",
  };

  return (
    <div className="grid gap-4">
      <PageHeader title="Plan and billing" sub={org.name} />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">{current.name}</span>
              <Badge tone={org.subscription_status === "active" ? "green" : trial?.over || org.subscription_status === "halted" ? "red" : "blue"}>{statusLabel[org.subscription_status ?? "none"]}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {trial
                ? trial.over
                  ? "Your free trial has ended. Visitors see your contact details instead of AI replies until you choose a plan."
                  : `${trial.left} of ${trial.limit} AI replies and ${trial.daysLeft} days left in your free trial.`
                : org.cancel_at_period_end
                  ? `Cancelled. Your plan stays active until ${org.current_period_end ? fmtDate(org.current_period_end, org.timezone) : "the end of this billing period"}.`
                  : org.current_period_end
                    ? `Renews on ${fmtDate(org.current_period_end, org.timezone)} · ${fmtInr(current.priceInr)}/month + GST.`
                    : `${fmtInr(current.priceInr)}/month + GST.`}
            </p>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {paidPlans().map((p) => (
          <Card key={p.id}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <div><span className="text-2xl font-bold">{fmtInr(p.priceInr)}</span><span className="text-sm text-slate-500">/month</span></div>
            </div>
            <p className="mt-1 text-sm text-slate-600">{p.blurb}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {p.features.map((f) => <li key={f}>✓ {f}</li>)}
            </ul>
            <div className="mt-4">
              <PlanButtons orgId={orgId} plan={p.id as "starter" | "growth"} current={org.plan === p.id && org.subscription_status === "active"} cancelling={Boolean(org.cancel_at_period_end)} />
            </div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Payments by Razorpay (UPI, cards, net banking). Prices exclude 18% GST. Cancel any time; your plan runs until the end of the paid month.
        The free trial includes {TRIAL.replies} AI replies over {TRIAL.days} days, once per email address.
      </p>
    </div>
  );
}

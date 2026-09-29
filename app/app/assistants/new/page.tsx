import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Notice, PageHeader, btn } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { planDef } from "@/lib/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AddAssistantForm } from "./form";

export const metadata: Metadata = { title: "Add assistant" };
export const dynamic = "force-dynamic";

export default async function NewAssistantPage() {
  const session = await requireSession();
  if (session.isAdmin && !session.orgIds.length) redirect("/app/orgs/new");
  const orgId = session.orgIds[0];
  if (!orgId) redirect("/start");
  const db = supabaseAdmin();
  const [{ data: org }, { count }] = await Promise.all([
    db.from("organizations").select("plan").eq("id", orgId).single(),
    db.from("bots").select("id", { count: "exact", head: true }).eq("org_id", orgId),
  ]);
  const plan = planDef(org?.plan ?? "trial");
  const used = count ?? 0;
  const full = used >= plan.bots;
  return (
    <div className="grid max-w-2xl gap-5">
      <PageHeader title="Add an assistant" sub={`For another website or brand. Your ${plan.name} plan includes ${plan.bots} assistant${plan.bots === 1 ? "" : "s"}; you're using ${used}.`} />
      {full ? (
        <Notice tone="amber">
          You&apos;ve used all {plan.bots} assistant{plan.bots === 1 ? "" : "s"} on {plan.name}. {plan.id === "growth" ? "Contact us for more." : `Growth includes up to ${planDef("growth").bots}.`}{" "}
          {plan.id !== "growth" ? <Link className="font-medium underline" href="/app/billing">See plans</Link> : null}
        </Notice>
      ) : (
        <Card title="New assistant" sub="It starts with your current branding, lead emails and contact details. Next you'll import its website.">
          <AddAssistantForm />
        </Card>
      )}
      <Link href="/app" className={`${btn.ghost} w-fit`}>Back to assistants</Link>
    </div>
  );
}

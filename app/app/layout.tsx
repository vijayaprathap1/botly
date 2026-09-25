export const dynamic = "force-dynamic";

import { AppShell } from "@/components/app-shell";
import { checkAnthropicLive } from "@/lib/ai-check";
import { requireSession } from "@/lib/auth";
import { featureProblems } from "@/lib/env-check";
import { planDef, trialState } from "@/lib/plans";
import { supabaseServer } from "@/lib/supabase/server";
import type { OrgRow } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const db = await supabaseServer();
  const { data: rows } = await db.from("bots").select("id, name, org:organizations(*)").order("created_at", { ascending: false }).limit(200);
  const bots = ((rows ?? []) as unknown as { id: string; name: string; org: OrgRow }[]).map((b) => ({ id: b.id, name: b.name, business: b.org.name, org: b.org }));
  const myOrg = !session.isAdmin ? bots.find((b) => session.orgIds.includes(b.org.id))?.org : undefined;
  const trial = myOrg ? trialState(myOrg) : null;
  // Super admin: surface a broken AI key immediately (live check, cached 5 minutes).
  const ai = session.isAdmin && process.env.BOTLY_TEST_SCRIPTED_LLM !== "1" ? await checkAnthropicLive() : null;
  const problems = session.isAdmin ? featureProblems() : [];

  return (
    <AppShell
      email={session.email}
      isAdmin={session.isAdmin}
      hasWorkspace={session.orgIds.length > 0}
      bots={bots.map(({ id, name, business }) => ({ id, name, business }))}
      trial={trial ? { left: trial.left, limit: trial.limit, daysLeft: trial.daysLeft, over: trial.over } : null}
      planName={myOrg ? planDef(myOrg.plan).name : null}
    >
      {ai && !ai.ok ? (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-900" role="alert">
          <b>AI replies are failing.</b> Claude returned: <span className="font-mono text-[12.5px]">{ai.error}</span>. Visitors see your contact details instead of answers. Fix
          ANTHROPIC_API_KEY in your hosting settings (a key created inside a workspace, with credit) and redeploy.
        </div>
      ) : null}
      {problems.map((p) => (
        <div key={p.name} className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          <b>{p.name}</b> {p.problem}: {p.name === "ANTHROPIC_API_KEY" ? "the assistant can't reply" : "lead emails won't be sent"}. {p.fix}.
        </div>
      ))}
      {children}
    </AppShell>
  );
}

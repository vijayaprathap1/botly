"use server";

import { getSession } from "@/lib/auth";
import { trialState } from "@/lib/plans";
import { supabaseServer } from "@/lib/supabase/server";
import type { OrgRow } from "@/lib/types";

export type ShellTrial = { left: number; limit: number; daysLeft: number; over: boolean } | null;

/**
 * The sidebar's trial card, re-read on demand. The /app layout isn't re-rendered on
 * client navigation, so without this the counter showed the count from the last full
 * page load (QA: "the sidebar counter lags"). Same workspace pick as app/app/layout.tsx.
 */
export async function currentTrial(): Promise<ShellTrial> {
  const session = await getSession();
  if (!session || session.isAdmin || !session.orgIds.length) return null;
  const db = await supabaseServer();
  const { data } = await db
    .from("bots")
    .select("org:organizations(*)")
    .in("org_id", session.orgIds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const org = (data as unknown as { org: OrgRow } | null)?.org;
  const t = org ? trialState(org) : null;
  return t ? { left: t.left, limit: t.limit, daysLeft: t.daysLeft, over: t.over } : null;
}

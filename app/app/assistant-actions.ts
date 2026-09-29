"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { planDef } from "@/lib/plans";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ActionState } from "./actions";

function normalizeHost(raw: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Owners add another assistant (e.g. a second website) up to their plan's limit. */
export async function addAssistant(_: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireSession();
  const orgId = session.orgIds[0];
  if (!orgId) return { error: "Set up your business first." };
  const db = supabaseAdmin();
  const [{ data: org }, { data: existing }] = await Promise.all([
    db.from("organizations").select("id, name, plan, suspended").eq("id", orgId).single(),
    db.from("bots").select("*").eq("org_id", orgId).order("created_at", { ascending: true }),
  ]);
  if (!org) return { error: "Workspace not found." };
  const limit = planDef(org.plan).bots;
  if (!session.isAdmin && (existing?.length ?? 0) >= limit) {
    return { error: `Your ${planDef(org.plan).name} plan includes ${limit} assistant${limit === 1 ? "" : "s"}. Upgrade to Growth for up to ${planDef("growth").bots}.` };
  }
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const website = String(form.get("website") ?? "").trim().slice(0, 300);
  if (name.length < 2) return { error: "Give the assistant a name, like the website it's for." };
  const host = website ? normalizeHost(website) : null;
  if (website && !host) return { error: "That website address doesn't look right." };
  const first = existing?.[0] as Record<string, unknown> | undefined;
  const branding = (first?.branding as Record<string, unknown> | undefined) ?? { primary_color: "#4f46e5", avatar_url: null, assistant_name: "Assistant", position: "right", theme: "auto", show_powered_by: true };
  const { data: bot, error } = await db
    .from("bots")
    .insert({
      org_id: orgId,
      name,
      website_url: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
      model: config.defaultModel,
      allowed_origins: host ? [host] : [],
      greeting: (first?.greeting as string | undefined) ?? `Hi! How can I help you today?`,
      tone: (first?.tone as string | undefined) ?? null,
      branding,
      notify_emails: (first?.notify_emails as string[] | undefined) ?? [],
      notify_whatsapp: (first?.notify_whatsapp as string[] | undefined) ?? [],
      fallback_contact: (first?.fallback_contact as Record<string, string> | undefined) ?? {},
      privacy_url: (first?.privacy_url as string | undefined) ?? null,
    })
    .select("id")
    .single();
  if (error || !bot) return { error: "Couldn't create the assistant. Please try again." };
  redirect(`/app/bots/${bot.id}/onboarding`);
}

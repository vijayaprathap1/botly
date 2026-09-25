"use server";

import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { TRIAL } from "@/lib/plans";
import { normalizeOrigin } from "@/lib/security/origin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { estimateTokens } from "@/lib/tokens";
import { isValidEmail, normalizePhone } from "@/lib/validation/phone";

export type StartState = { error?: string; field?: string; botId?: string; ownerNotes?: string; url?: string | null } | null;

const SOCIAL = ["instagram", "facebook", "linkedin", "youtube", "x", "google"] as const;
const optUrl = z.string().trim().max(500).optional().transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : ""));

const schema = z.object({
  businessName: z.string().trim().min(2, "Enter your business name").max(120),
  businessType: z.string().trim().min(2).max(60),
  website: optUrl,
  about: z.string().trim().max(8000).optional().default(""),
  address: z.string().trim().max(400).optional().default(""),
  hours: z.string().trim().max(400).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  whatsapp: z.string().trim().max(30).optional().default(""),
  contactEmail: z.string().trim().max(200).optional().default(""),
  socialText: z.string().trim().max(8000).optional().default(""),
  assistantName: z.string().trim().min(1).max(40).default("Assistant"),
  consent: z.literal("on", { message: "Please confirm you represent this business" }),
});

/** Self-serve sign-up: creates the business workspace, a free trial and the assistant. */
export async function startWorkspace(_: StartState, form: FormData): Promise<StartState> {
  const session = await requireSession();
  if (session.orgIds.length) return { error: "You already have a workspace.", botId: undefined };
  const raw = Object.fromEntries(form.entries());
  const p = schema.safeParse(raw);
  if (!p.success) {
    const i = p.error.issues[0]!;
    return { error: i.message, field: String(i.path[0] ?? "") };
  }
  const d = p.data;
  const social: Record<string, string> = {};
  for (const k of SOCIAL) {
    const v = optUrl.parse(String(raw[`social_${k}`] ?? ""));
    if (v) {
      try {
        new URL(v);
        social[k] = v;
      } catch {
        return { error: `The ${k} link isn't a valid URL`, field: `social_${k}` };
      }
    }
  }
  if (d.website) {
    try {
      new URL(d.website);
    } catch {
      return { error: "The website address isn't valid", field: "website" };
    }
  }
  if (!d.website && d.about.length < 40 && d.socialText.length < 40) {
    return { error: "Add your website, or tell us about your business (a few sentences) so the assistant has something to learn from.", field: "about" };
  }
  const phone = d.phone ? normalizePhone(d.phone) : null;
  if (phone && !phone.ok) return { error: phone.error, field: "phone" };
  const wa = d.whatsapp ? normalizePhone(d.whatsapp) : null;
  if (wa && !wa.ok) return { error: wa.error, field: "whatsapp" };
  if (d.contactEmail && !isValidEmail(d.contactEmail)) return { error: "That email doesn't look right", field: "contactEmail" };

  const db = supabaseAdmin();
  const email = (session.email ?? "").toLowerCase();
  // One free trial per email address.
  const { data: claimed } = await db.from("trial_claims").select("email").eq("email", email).maybeSingle();
  const trialEnds = claimed ? new Date() : new Date(Date.now() + TRIAL.days * 86_400_000);

  const { data: org, error } = await db
    .from("organizations")
    .insert({
      name: d.businessName,
      business_type: d.businessType,
      plan: "trial",
      monthly_conversation_quota: config.defaultQuota("trial"),
      self_serve: true,
      created_by: session.userId,
      trial_ends_at: trialEnds.toISOString(),
      trial_reply_limit: claimed ? 0 : TRIAL.replies,
      subscription_status: claimed ? "expired" : "trialing",
      billing_email: email || null,
      website_url: d.website || null,
      social_links: social,
      onboarding_status: "pending",
    })
    .select("id")
    .single();
  if (error || !org) return { error: "Couldn't create your workspace. Please try again." };
  await db.from("memberships").insert({ user_id: session.userId, org_id: org.id, role: "owner" });
  if (!claimed && email) await db.from("trial_claims").insert({ email, org_id: org.id });

  const site = d.website ? normalizeOrigin(d.website) : null;
  const host = site ? new URL(site).host.replace(/^www\./, "") : null;
  const contact = { phone: phone?.ok ? phone.display : undefined, whatsapp: wa?.ok ? wa.display : undefined, email: d.contactEmail || email || undefined };
  const { data: bot, error: e2 } = await db
    .from("bots")
    .insert({
      org_id: org.id,
      name: "Website assistant",
      website_url: d.website || null,
      model: config.defaultModel,
      allowed_origins: host ? [host] : [],
      greeting: `Hi! I'm ${d.assistantName} from ${d.businessName}. How can I help you today?`,
      branding: { primary_color: "#4f46e5", avatar_url: null, assistant_name: d.assistantName, position: "right", theme: "auto", show_powered_by: true },
      notify_emails: [d.contactEmail || email].filter(Boolean),
      notify_whatsapp: wa?.ok ? [wa.e164] : [],
      fallback_contact: contact,
    })
    .select("id")
    .single();
  if (e2 || !bot) return { error: "Couldn't create your assistant. Please try again." };

  // Everything the owner typed is their own statement of fact: save it approved.
  const lines = [
    d.about && `About the business:\n${d.about}`,
    d.address && `Address: ${d.address}`,
    d.hours && `Opening hours: ${d.hours}`,
    phone?.ok && `Phone: ${phone.display}`,
    wa?.ok && `WhatsApp: ${wa.display}`,
    d.contactEmail && `Email: ${d.contactEmail}`,
    d.website && `Website: ${d.website}`,
    Object.keys(social).length && `Online profiles:\n${Object.entries(social).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`,
    d.socialText && `From the business's social media profiles (provided by the owner):\n${d.socialText}`,
  ].filter(Boolean) as string[];
  const ownerNotes = lines.join("\n\n");
  if (ownerNotes) {
    await db.from("knowledge_sources").insert({
      bot_id: bot.id, type: "note", title: "Details from the owner", url: null, content: ownerNotes, status: "approved",
      token_count: estimateTokens(ownerNotes), updated_by: session.userId,
    });
  }
  return { botId: bot.id, ownerNotes, url: d.website || null };
}

"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { afterKnowledgeChange } from "@/lib/knowledge-sync";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { parseProductCsv, productContent } from "@/lib/csv";
import { DAYS, type BusinessHours } from "@/lib/hours";
import { normalizeOrigin } from "@/lib/security/origin";
import { supabaseServer } from "@/lib/supabase/server";
import { estimateTokens } from "@/lib/tokens";
import { isValidEmail, normalizePhone } from "@/lib/validation/phone";

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const uuid = z.string().uuid();

function cleanOrigins(list: string[]): string[] {
  return [
    ...new Set(
      list.map((o) => {
        const v = o.trim().toLowerCase().replace(/\/+$/, "");
        if (v.startsWith("*.")) return v;
        if (v.includes("://")) return normalizeOrigin(v) ?? "";
        return v.replace(/^www\./, "");
      }),
    ),
  ].filter(Boolean);
}

// ─── Orgs + bots ──────────────────────────────────────────────────────────────
const createSchema = z.object({
  orgName: z.string().trim().min(1).max(200),
  businessType: z.string().trim().min(1).max(100),
  plan: z.enum(["starter", "growth"]),
  quota: z.coerce.number().int().min(0).max(1_000_000).optional(),
  timezone: z.string().trim().min(1).max(64),
  botName: z.string().trim().min(1).max(120),
  websiteUrl: z.string().trim().url().max(500).or(z.literal("")),
  assistantName: z.string().trim().min(1).max(40),
});

export async function createOrgAndBot(_: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const p = createSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form" };
  const d = p.data;
  try {
    Intl.DateTimeFormat("en", { timeZone: d.timezone });
  } catch {
    return { error: "Unknown timezone" };
  }
  const db = await supabaseServer();
  const { data: org, error } = await db
    .from("organizations")
    .insert({ name: d.orgName, business_type: d.businessType, plan: d.plan, monthly_conversation_quota: d.quota ?? config.defaultQuota(d.plan), timezone: d.timezone })
    .select("id")
    .single();
  if (error || !org) return { error: error?.message ?? "Could not create the client" };
  const site = d.websiteUrl ? normalizeOrigin(d.websiteUrl) : null;
  const { data: bot, error: e2 } = await db
    .from("bots")
    .insert({
      org_id: org.id,
      name: d.botName,
      website_url: d.websiteUrl || null,
      model: config.defaultModel,
      allowed_origins: site ? cleanOrigins([new URL(site).host]) : [],
      branding: { primary_color: "#4f46e5", avatar_url: null, assistant_name: d.assistantName, position: "right", theme: "auto", show_powered_by: true },
      notify_emails: session.email ? [session.email] : [],
    })
    .select("id")
    .single();
  if (e2 || !bot) return { error: e2?.message ?? "Could not create the bot" };
  revalidatePath("/app");
  redirect(`/app/bots/${bot.id}/onboarding`);
}

// ─── Settings ────────────────────────────────────────────────────────────────
function parseHours(form: FormData): BusinessHours | string {
  const hours: BusinessHours = {};
  for (const d of DAYS) {
    const raw = text(form.get(`hours_${d}`));
    if (!raw || /^closed$/i.test(raw)) {
      hours[d] = [];
      continue;
    }
    const ranges = raw.split(",").map((r) => r.trim());
    const out: [string, string][] = [];
    for (const r of ranges) {
      const m = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/.exec(r);
      if (!m) return `Business hours for ${d}: use 10:00-19:00 (or leave empty for closed).`;
      const a = `${m[1]!.padStart(2, "0")}:${m[2]}`;
      const b = `${m[3]!.padStart(2, "0")}:${m[4]}`;
      if (a >= b) return `Business hours for ${d}: closing time must be after opening time.`;
      out.push([a, b]);
    }
    hours[d] = out;
  }
  return hours;
}

export async function updateBotSettings(botId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  if (!uuid.safeParse(botId).success) return { error: "Bad bot id" };
  const color = text(form.get("primary_color"));
  if (!/^#[0-9a-f]{6}$/i.test(color)) return { error: "Primary colour must look like #9f1239" };
  const hours = parseHours(form);
  if (typeof hours === "string") return { error: hours };
  const emails = lines(form.get("notify_emails"));
  const badEmail = emails.find((e) => !isValidEmail(e));
  if (badEmail) return { error: `Not a valid email: ${badEmail}` };
  const whatsapps: string[] = [];
  for (const w of lines(form.get("notify_whatsapp"))) {
    const p = normalizePhone(w);
    if (!p.ok) return { error: `WhatsApp number ${w}: ${p.error}` };
    whatsapps.push(p.e164);
  }
  const avatar = text(form.get("avatar_url"));
  if (avatar && !/^https:\/\//.test(avatar)) return { error: "Avatar URL must start with https://" };
  const privacy = text(form.get("privacy_url"));
  if (privacy && !/^https?:\/\//.test(privacy)) return { error: "Privacy URL must start with http(s)://" };
  const quotaRaw = text(form.get("bot_quota"));
  const botQuota = quotaRaw ? Number(quotaRaw) : null;
  if (botQuota !== null && (!Number.isInteger(botQuota) || botQuota < 0)) return { error: "Quota override must be a whole number" };
  const model = text(form.get("model")) || config.defaultModel;
  if (!/^claude-[a-z0-9.\-]+$/.test(model)) return { error: "Model must be a Claude model id, e.g. claude-haiku-4-5" };

  const db = await supabaseServer();
  const patch = {
    name: text(form.get("name")).slice(0, 120) || "Website assistant",
    greeting: text(form.get("greeting")).slice(0, 500),
    nudge: text(form.get("nudge")).slice(0, 200) || null,
    tone: text(form.get("tone")).slice(0, 500) || "Warm, friendly and concise.",
    suggested_questions: lines(form.get("suggested_questions")).slice(0, 4).map((q) => q.slice(0, 80)),
    languages: form.getAll("languages").map(String).filter((l) => ["en", "ta", "hi"].includes(l)),
    allowed_origins: cleanOrigins(lines(form.get("allowed_origins"))),
    notify_emails: emails,
    notify_whatsapp: whatsapps,
    fallback_contact: {
      phone: text(form.get("fallback_phone")) || undefined,
      whatsapp: text(form.get("fallback_whatsapp")) || undefined,
      email: text(form.get("fallback_email")) || undefined,
    },
    privacy_url: privacy || null,
    business_hours: hours,
    branding: {
      primary_color: color,
      avatar_url: avatar || null,
      assistant_name: text(form.get("assistant_name")).slice(0, 40) || "Assistant",
      position: form.get("position") === "left" ? "left" : "right",
      theme: ["light", "dark", "auto"].includes(text(form.get("theme"))) ? text(form.get("theme")) : "auto",
      show_powered_by: form.get("show_powered_by") === "on",
    },
    active: form.get("active") === "on",
    model,
    monthly_conversation_quota: botQuota,
  };
  const { data: bot, error } = await db.from("bots").update(patch).eq("id", botId).select("org_id").single();
  if (error) return { error: error.message };

  const plan = text(form.get("plan"));
  const orgQuota = Number(text(form.get("org_quota")));
  if ((plan === "starter" || plan === "growth") && Number.isInteger(orgQuota) && orgQuota >= 0) {
    const { error: e2 } = await db.from("organizations").update({ plan, monthly_conversation_quota: orgQuota }).eq("id", bot.org_id);
    if (e2) return { error: e2.message };
  }
  revalidatePath(`/app/bots/${botId}`, "layout");
  return { ok: true, message: "Saved. Changes apply to the next message." };
}

/** §8: a bot can go live only after the prompt-injection evals pass. */
export async function setBotStatus(botId: string, form: FormData) {
  await requireAdmin();
  const live = form.get("status") === "live";
  const db = await supabaseServer();
  if (live) {
    const { data: run } = await db.from("eval_runs").select("injection_passed").eq("bot_id", botId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!run?.injection_passed) redirect(`/app/bots/${botId}?live=blocked`);
  }
  await db.from("bots").update({ status: live ? "live" : "draft" }).eq("id", botId);
  revalidatePath(`/app/bots/${botId}`, "layout");
  redirect(`/app/bots/${botId}`);
}

export async function rotateTestToken(botId: string) {
  await requireAdmin();
  const db = await supabaseServer();
  const token = "tt_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await db.from("bots").update({ test_token: token }).eq("id", botId);
  revalidatePath(`/app/bots/${botId}`, "layout");
}

export async function applyToneSuggestion(botId: string) {
  await requireAdmin();
  const db = await supabaseServer();
  const { data } = await db.from("bots").select("tone_suggestion").eq("id", botId).single();
  if (data?.tone_suggestion) await db.from("bots").update({ tone: data.tone_suggestion, tone_suggestion: null }).eq("id", botId);
  revalidatePath(`/app/bots/${botId}`, "layout");
}

// ─── Knowledge ───────────────────────────────────────────────────────────────
const sourceSchema = z.object({
  type: z.enum(["page", "faq", "policy", "product", "file", "note"]),
  title: z.string().trim().min(1, "Title is required").max(300),
  url: z.string().trim().url().max(1000).or(z.literal("")),
  content: z.string().trim().min(1, "Content is required").max(60_000),
  status: z.enum(["draft", "approved", "archived"]),
});

export async function saveSource(botId: string, sourceId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const p = sourceSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form" };
  const row = { ...p.data, url: p.data.url || null, token_count: estimateTokens(p.data.content), updated_by: session.userId };
  const db = await supabaseServer();
  const res = sourceId ? await db.from("knowledge_sources").update(row).eq("id", sourceId).eq("bot_id", botId) : await db.from("knowledge_sources").insert({ ...row, bot_id: botId });
  if (res.error) return { error: res.error.message };
  after(() => afterKnowledgeChange(botId));
  revalidatePath(`/app/bots/${botId}/knowledge`);
  redirect(`/app/bots/${botId}/knowledge`);
}

export async function bulkSources(botId: string, form: FormData) {
  await requireAdmin();
  const ids = form.getAll("ids").map(String).filter((id) => uuid.safeParse(id).success);
  const action = text(form.get("action"));
  const back = text(form.get("back")) || `/app/bots/${botId}/knowledge`;
  if (ids.length) {
    const db = await supabaseServer();
    if (action === "delete") await db.from("knowledge_sources").delete().eq("bot_id", botId).in("id", ids);
    else if (["approved", "archived", "draft"].includes(action)) await db.from("knowledge_sources").update({ status: action }).eq("bot_id", botId).in("id", ids);
    after(() => afterKnowledgeChange(botId));
  }
  revalidatePath(`/app/bots/${botId}/knowledge`);
  redirect(back.startsWith(`/app/bots/${botId}/knowledge`) ? back : `/app/bots/${botId}/knowledge`);
}

export async function importProducts(botId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file" };
  if (file.size > 2_000_000) return { error: "CSV is too large (2 MB max)" };
  const { rows, errors } = parseProductCsv(await file.text());
  if (!rows.length) return { error: errors[0] ?? "No products found" };
  const status = form.get("approve") === "on" ? "approved" : "draft";
  const db = await supabaseServer();
  const { data: existing } = await db.from("knowledge_sources").select("id, title").eq("bot_id", botId).eq("type", "product").neq("status", "archived");
  const byTitle = new Map((existing ?? []).map((r) => [String(r.title).toLowerCase(), r.id as string]));
  let created = 0;
  let updated = 0;
  for (const r of rows) {
    const content = productContent(r);
    const row = { title: r.name, url: r.url || null, content: content || r.name, status, token_count: estimateTokens(content), updated_by: session.userId };
    const id = byTitle.get(r.name.toLowerCase());
    const res = id ? await db.from("knowledge_sources").update(row).eq("id", id) : await db.from("knowledge_sources").insert({ ...row, bot_id: botId, type: "product" });
    if (res.error) return { error: res.error.message };
    if (id) updated++;
    else created++;
  }
  after(() => afterKnowledgeChange(botId));
  revalidatePath(`/app/bots/${botId}/knowledge`);
  return { ok: true, message: `${created} added, ${updated} updated (${status}).${errors.length ? ` ${errors.length} row(s) skipped: ${errors.slice(0, 3).join(" ")}` : ""}` };
}

export async function uploadDocument(botId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF or DOCX file" };
  if (file.size > 4_500_000) return { error: "File is too large (4.5 MB max)" };
  const name = file.name.toLowerCase();
  let content = "";
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (name.endsWith(".pdf")) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(buf);
      const { text: t } = await extractText(pdf, { mergePages: true });
      content = Array.isArray(t) ? t.join("\n") : t;
    } else if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      content = (await mammoth.extractRawText({ buffer: Buffer.from(buf) })).value;
    } else if (name.endsWith(".txt") || name.endsWith(".md")) {
      content = new TextDecoder().decode(buf);
    } else return { error: "Only PDF, DOCX, TXT or MD files" };
  } catch (e) {
    return { error: `Couldn't read the file: ${e instanceof Error ? e.message : "unknown error"}` };
  }
  content = content.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 60_000);
  if (content.length < 20) return { error: "No text found in the file (scanned PDFs need OCR first)." };
  const db = await supabaseServer();
  const { error } = await db.from("knowledge_sources").insert({ bot_id: botId, type: "file", title: file.name, content, status: "draft", token_count: estimateTokens(content), updated_by: session.userId });
  if (error) return { error: error.message };
  revalidatePath(`/app/bots/${botId}/knowledge`);
  return { ok: true, message: `Added "${file.name}" as a draft (${estimateTokens(content).toLocaleString()} tokens). Review and approve it below.` };
}

// ─── Leads ───────────────────────────────────────────────────────────────────
export async function setLeadStatus(botId: string, form: FormData) {
  await requireSession(); // owners may update status too (RLS + column grant enforce scope)
  const id = text(form.get("leadId"));
  const status = text(form.get("status"));
  if (!uuid.safeParse(id).success || !["new", "contacted", "won", "lost"].includes(status)) return;
  const db = await supabaseServer();
  await db.from("leads").update({ status }).eq("id", id);
  revalidatePath(`/app/bots/${botId}/leads`);
}

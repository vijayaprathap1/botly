"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireBotEditor } from "@/lib/bot-access";
import { requireAdmin, requireSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { afterKnowledgeChange } from "@/lib/knowledge-sync";
import { escapeHtml, sendEmail } from "@/lib/notify/email";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { estimateTokens } from "@/lib/tokens";
import { normalizePhone } from "@/lib/validation/phone";
import type { ActionState } from "./actions";

const uuid = z.string().uuid();
const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();

// ─── Unanswered inbox (P10) ──────────────────────────────────────────────────
/** One step: the answer becomes an approved FAQ and the question is marked answered. */
export async function answerUnanswered(botId: string, questionId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { session, bot: editable } = await requireBotEditor(botId);
  if (!uuid.safeParse(questionId).success) return { error: "Bad id" };
  const answer = text(form.get("answer")).slice(0, 4000);
  const question = text(form.get("question")).slice(0, 300);
  if (answer.length < 2) return { error: "Write the answer first" };
  if (question.length < 2) return { error: "The question can't be empty" };
  const db = supabaseAdmin();
  const content = `Q: ${question}\nA: ${answer}`;
  const { data: src, error } = await db
    .from("knowledge_sources")
    .insert({ bot_id: botId, type: "faq", title: question, content, status: "approved", token_count: estimateTokens(content), updated_by: session.userId })
    .select("id")
    .single();
  if (error || !src) return { error: error?.message ?? "Could not save" };
  const { error: e2 } = await db.from("unanswered_questions").update({ status: "answered", answer_source_id: src.id }).eq("id", questionId).eq("bot_id", botId);
  if (e2) return { error: e2.message };
  after(() => afterKnowledgeChange(botId));
  revalidatePath(`/app/bots/${botId}/unanswered`);
  return { ok: true, message: "Added to the knowledge. The assistant uses it from the next message." };
}

export async function setUnansweredStatus(botId: string, form: FormData) {
  const { session, bot: editable } = await requireBotEditor(botId);
  const id = text(form.get("id"));
  const status = text(form.get("status"));
  if (!uuid.safeParse(id).success || !["open", "ignored"].includes(status)) return;
  const db = supabaseAdmin();
  await db.from("unanswered_questions").update({ status }).eq("id", id).eq("bot_id", botId);
  revalidatePath(`/app/bots/${botId}/unanswered`);
}

/** Owners suggest; the admin approves by answering (RLS + trigger allow only suggestion columns). */
export async function suggestAnswer(botId: string, questionId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  if (!uuid.safeParse(questionId).success) return { error: "Bad id" };
  const suggestion = text(form.get("suggestion")).slice(0, 4000);
  if (suggestion.length < 2) return { error: "Write a suggestion first" };
  const db = await supabaseServer();
  const { error } = await db.from("unanswered_questions").update({ suggested_answer: suggestion }).eq("id", questionId).eq("bot_id", botId);
  if (error) return { error: error.message };
  revalidatePath(`/app/bots/${botId}/unanswered`);
  return { ok: true, message: "Thanks! Your answer will be reviewed and added." };
}

// ─── Client (owner) access ───────────────────────────────────────────────────
export async function inviteOwner(botId: string, orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { session, bot: editable } = await requireBotEditor(botId);
  if (editable.org_id !== orgId) return { error: "Not allowed" };
  const email = text(form.get("email")).toLowerCase();
  if (!z.string().email().safeParse(email).success) return { error: "Enter a valid email" };
  const db = supabaseAdmin();
  const { data: org } = await db.from("organizations").select("name").eq("id", orgId).single();
  const { error } = await db.from("org_invites").upsert({ org_id: orgId, email, invited_by: session.userId, accepted_at: null }, { onConflict: "org_id,email" });
  if (error) return { error: error.message };
  // If they already have an account, access starts now; otherwise on their first sign-in.
  const { error: e2 } = await supabaseAdmin().rpc("accept_invites_for_email", { p_email: email });
  if (e2) console.error("[invite] accept existing", e2.message);
  const login = `${config.appUrl}/login`;
  const mail = await sendEmail({
    to: email,
    subject: `Your ${org?.name ?? "Botly"} chat assistant dashboard`,
    text: `You now have access to the ${org?.name ?? ""} assistant dashboard: conversations, leads, unanswered questions and monthly reports.\n\nSign in with this email address at ${login} (we'll email you a one-time link).`,
    html: `<p>You now have access to the <b>${escapeHtml(org?.name ?? "")}</b> chat assistant dashboard: conversations, leads, unanswered questions and monthly reports.</p><p><a href="${escapeHtml(login)}">Sign in</a> with this email address. We'll email you a one-time link, no password needed.</p>`,
  });
  revalidatePath(`/app/bots/${botId}`);
  return { ok: true, message: mail.sent ? `Invited ${email}. They'll get an email with the sign-in link.` : `Invited ${email}. Email not sent (${mail.error}); send them ${login}.` };
}

export async function revokeOwner(botId: string, form: FormData) {
  const { session, bot: editable } = await requireBotEditor(botId);
  const id = text(form.get("inviteId"));
  if (!uuid.safeParse(id).success) return;
  const db = supabaseAdmin();
  const { data: inv } = await db.from("org_invites").select("org_id, accepted_user_id").eq("id", id).single();
  if (!inv || inv.org_id !== editable.org_id) return;
  if (inv?.accepted_user_id) await db.from("memberships").delete().eq("user_id", inv.accepted_user_id).eq("org_id", inv.org_id).eq("role", "owner");
  await db.from("org_invites").delete().eq("id", id);
  revalidatePath(`/app/bots/${botId}`);
}

// ─── Privacy: delete one visitor's data (DPDP) ──────────────────────────────
export async function deleteVisitorData(botId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { session, bot: editable } = await requireBotEditor(botId);
  const phoneRaw = text(form.get("phone"));
  const visitorId = text(form.get("visitorId"));
  if (form.get("confirm") !== "DELETE") return { error: 'Type DELETE to confirm' };
  let phone = "";
  if (phoneRaw) {
    const p = normalizePhone(phoneRaw);
    if (!p.ok) return { error: p.error };
    phone = p.e164;
  }
  if (!phone && !/^[A-Za-z0-9_-]{8,64}$/.test(visitorId)) return { error: "Give a phone number or a visitor id" };
  // Admin checked above; the function runs with the service role.
  const { data, error } = await supabaseAdmin().rpc("delete_visitor_data", { p_bot_id: botId, p_phone: phone, p_visitor_id: visitorId || null });
  if (error) return { error: error.message };
  const r = data as { conversations: number; leads: number };
  revalidatePath(`/app/bots/${botId}`, "layout");
  return { ok: true, message: `Deleted ${r.conversations} conversation(s) and ${r.leads} lead(s).` };
}

// ─── Report / retention settings ─────────────────────────────────────────────
export async function updateOrgOps(botId: string, orgId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { bot: editable } = await requireBotEditor(botId);
  if (editable.org_id !== orgId) return { error: "Not allowed" };
  const minutes = Number(text(form.get("minutes")));
  const retention = Number(text(form.get("retention")));
  if (!(minutes > 0 && minutes <= 120)) return { error: "Minutes per conversation: 0.5 to 120" };
  if (!Number.isInteger(retention) || retention < 1 || retention > 120) return { error: "Retention: 1 to 120 months" };
  const db = supabaseAdmin();
  const { error } = await db.from("organizations").update({ minutes_saved_per_conversation: minutes, retention_months: retention }).eq("id", orgId);
  if (error) return { error: error.message };
  revalidatePath(`/app/bots/${botId}`, "layout");
  return { ok: true, message: "Saved." };
}

// ─── Retrieval index ────────────────────────────────────────────────────────
export async function rebuildIndex(botId: string) {
  const { session, bot: editable } = await requireBotEditor(botId);
  const { syncChunks } = await import("@/lib/retrieval/index-sync");
  try {
    await syncChunks(botId);
  } catch (e) {
    console.error("[rebuildIndex]", e instanceof Error ? e.message : e);
  }
  revalidatePath(`/app/bots/${botId}/knowledge`);
}

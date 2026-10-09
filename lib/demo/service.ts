import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import { HOURS_NOT_SET } from "../hours";
import { sendEmail } from "../notify/email";
import { brandEmail } from "../notify/layout";
import { runOnboarding } from "../onboarding/pipeline";
import type { DemoSiteRow, FallbackContact } from "../types";
import { estimateTokens } from "../tokens";
import { renderEnabled, renderSite, type Rendered } from "./render";
import { cleanSnapshot, fetchHomepage, looksBlocked, needsRendering, pickBusinessName, SnapshotError, type Fetched } from "./snapshot";
import { parsePublicUrl } from "./url-guard";

/**
 * Demo builder (super admin only). A demo is a throwaway organization + draft bot,
 * trained on a prospect's website, shown on a copy of their homepage at /demo/<slug>.
 *
 * It reuses what customers' bots use: the widget reaches the bot through its test
 * token (so no origin entry is needed and the bot never has to be live), and the trial
 * gate caps the replies and ends them on the expiry date.
 */
const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};
export const demoConfig = {
  get replyLimit() {
    return num("DEMO_REPLY_LIMIT", 150);
  },
  get defaultDays() {
    return num("DEMO_DEFAULT_DAYS", 14);
  },
  /** Who a prospect reaches when the demo runs out: you, never the business. */
  get contact(): FallbackContact {
    return {
      phone: process.env.DEMO_CONTACT_PHONE || process.env.SUPPORT_PHONE || undefined,
      whatsapp: process.env.DEMO_CONTACT_WHATSAPP || undefined,
      email: process.env.DEMO_CONTACT_EMAIL || process.env.SUPPORT_EMAIL || config.adminEmails[0] || undefined,
    };
  },
};

export const demoUrl = (slug: string) => `${config.appUrl}/demo/${slug}`;
const newSlug = () => randomBytes(24).toString("base64url"); // 32 characters, unguessable

async function setDemo(db: SupabaseClient, id: string, patch: Partial<DemoSiteRow>) {
  const { error } = await db.from("demo_sites").update(patch).eq("id", id);
  if (error) console.error("[demo] update", id, error.message);
}

export type CreateDemoInput = { url: string; businessName?: string; maxPages: number; days: number; adminEmail: string | null; userId: string };

/** Creates the rows for a demo and returns at once; `buildDemo` then does the slow part. */
export async function createDemo(db: SupabaseClient, input: CreateDemoInput): Promise<DemoSiteRow> {
  const url = parsePublicUrl(input.url);
  const expires = new Date(Date.now() + input.days * 86_400_000).toISOString();
  const placeholder = input.businessName?.trim() || url.hostname.replace(/^www\./, "");

  const { data: org, error } = await db
    .from("organizations")
    .insert({
      name: placeholder.slice(0, 200),
      business_type: "business",
      plan: "trial",
      is_demo: true,
      self_serve: false,
      monthly_conversation_quota: config.defaultQuota("trial"),
      trial_ends_at: expires,
      trial_reply_limit: demoConfig.replyLimit,
      trial_replies_used: 0,
      subscription_status: "trialing",
      onboarding_status: "done",
      website_url: url.toString(),
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !org) throw new Error(error?.message.includes("is_demo") ? "Run supabase/migrations/0009_demos.sql first." : error?.message ?? "Couldn't create the demo.");

  // If anything below fails, the org goes too (bot and demo row cascade).
  const undo = async () => void (await db.from("organizations").delete().eq("id", org.id));
  const { data: bot, error: e2 } = await db
    .from("bots")
    .insert({
      org_id: org.id,
      name: "Demo assistant",
      website_url: url.toString(),
      model: config.defaultModel,
      status: "draft", // reached only through the test token on the demo page
      active: true,
      allowed_origins: [],
      greeting: `Hi! I'm the assistant for ${placeholder}. Ask me anything about us.`,
      branding: { primary_color: "#4f46e5", avatar_url: null, assistant_name: "Assistant", position: "right", theme: "light", show_powered_by: true },
      notify_emails: input.adminEmail ? [input.adminEmail] : [],
      notify_whatsapp: [],
      fallback_contact: demoConfig.contact,
      business_hours: HOURS_NOT_SET,
    })
    .select("id")
    .single();
  if (e2 || !bot) {
    await undo();
    throw new Error(e2?.message ?? "Couldn't create the demo assistant.");
  }
  const { data: demo, error: e3 } = await db
    .from("demo_sites")
    .insert({
      slug: newSlug(),
      org_id: org.id,
      bot_id: bot.id,
      source_url: url.toString(),
      business_name: placeholder.slice(0, 200),
      status: "copying",
      progress: "Copying the homepage…",
      max_pages: input.maxPages,
      expires_at: expires,
      created_by: input.userId,
    })
    .select("*")
    .single();
  if (e3 || !demo) {
    await undo();
    throw new Error(e3?.message.includes("demo_sites") ? "Run supabase/migrations/0009_demos.sql first." : e3?.message ?? "Couldn't create the demo.");
  }
  return demo as DemoSiteRow;
}

/** Copies the homepage into the demo row. Returns false (and marks the demo failed) when it can't. */
export async function copyHomepage(db: SupabaseClient, demo: DemoSiteRow, opts: { nameGiven: boolean; forceRender?: boolean; userId?: string }): Promise<boolean> {
  await setDemo(db, demo.id, { status: "copying", progress: "Copying the homepage…", error: null });
  try {
    const { data: bot } = await db.from("bots").select("public_key, test_token, branding").eq("id", demo.bot_id).single();
    if (!bot) throw new SnapshotError("The demo assistant no longer exists.");
    // A plain download first (fast). If the page is an empty shell, or the site refuses
    // plain downloads, open it in a headless browser instead.
    let page: Fetched | null = null;
    let rendered: Rendered | null = null;
    let why: SnapshotError | null = null;
    if (!opts.forceRender) {
      try {
        page = await fetchHomepage(demo.source_url);
      } catch (e) {
        if (!(e instanceof SnapshotError) || !e.needsRender) throw e;
        why = e;
      }
    }
    if (!page || needsRendering(page.html)) {
      if (!renderEnabled()) throw why ?? new SnapshotError("This website is built in the browser, so a plain copy would be blank, and rendered copies are switched off (DEMO_RENDER=off).", true);
      await setDemo(db, demo.id, { progress: "Opening the site in a browser (it is built with JavaScript)…" });
      try {
        rendered = await renderSite(demo.source_url, { budgetMs: 80_000 });
      } catch (e) {
        console.error("[demo] render", demo.id, e instanceof Error ? e.message : e);
        throw new SnapshotError(why?.message ?? "We couldn't open this website in a browser to copy it. Try again in a minute.");
      }
      if (looksBlocked(200, rendered.html) || needsRendering(rendered.html)) throw new SnapshotError("This site shows a bot check instead of its homepage, so it can't be previewed.");
      page = { html: rendered.html, finalUrl: rendered.finalUrl };
    }
    const businessName = opts.nameGiven ? demo.business_name : pickBusinessName(page.html, page.finalUrl);
    const snap = cleanSnapshot({ html: page.html, finalUrl: page.finalUrl, businessName, slug: demo.slug, publicKey: bot.public_key as string, testToken: bot.test_token as string });
    const mode = rendered ? "rendered" : "static";
    await setDemo(db, demo.id, { html: snap.html, html_bytes: snap.bytes, final_url: page.finalUrl, business_name: businessName, mode });
    if (rendered) {
      // The crawler can't read a JavaScript-built site either: what the browser saw is the knowledge.
      const urls = rendered.pages.map((p) => p.url);
      await db.from("knowledge_sources").delete().eq("bot_id", demo.bot_id).eq("type", "page").in("url", urls);
      const rows = rendered.pages
        .filter((p) => p.text.trim().length > 80)
        .map((p) => ({ bot_id: demo.bot_id, type: "page", title: (p.title || new URL(p.url).pathname).slice(0, 300), url: p.url, content: p.text.slice(0, 60_000), status: "approved", token_count: estimateTokens(p.text.slice(0, 60_000)), updated_by: opts.userId ?? demo.created_by }));
      if (rows.length) {
        const { error } = await db.from("knowledge_sources").insert(rows);
        if (error) console.error("[demo] save rendered pages", error.message);
      }
    }
    demo.mode = mode;
    demo.final_url = page.finalUrl;
    demo.html = snap.html;
    await db.from("organizations").update({ name: businessName }).eq("id", demo.org_id);
    await db
      .from("bots")
      .update({ branding: { ...(bot.branding as Record<string, unknown>), primary_color: snap.color }, greeting: `Hi! I'm the assistant for ${businessName}. Ask me anything about us.` })
      .eq("id", demo.bot_id);
    demo.business_name = businessName;
    return true;
  } catch (e) {
    const message = e instanceof SnapshotError ? e.message : "Something went wrong while copying the homepage.";
    if (!(e instanceof SnapshotError)) console.error("[demo] copy", demo.id, e instanceof Error ? e.message : e);
    await setDemo(db, demo.id, { status: "failed", error: message, progress: null });
    return false;
  }
}

/** Reads their website and writes the assistant's knowledge (the same pipeline customers get). */
export async function trainDemo(db: SupabaseClient, demo: DemoSiteRow, userId: string, budgetMs: number): Promise<boolean> {
  await setDemo(db, demo.id, { status: "training", progress: "Reading the website…", error: null });
  let last = 0;
  try {
    // Rendered sites: the pages the browser read are already saved; FAQs are drafted from their text.
    let ownerNotes: string | undefined;
    if (demo.mode === "rendered") {
      const { data: pages } = await db.from("knowledge_sources").select("title, url, content").eq("bot_id", demo.bot_id).eq("type", "page").eq("status", "approved").limit(12);
      ownerNotes = (pages ?? []).map((p) => `Page: ${p.title} (${p.url})\n${String(p.content).slice(0, 4000)}`).join("\n\n").slice(0, 20_000) || undefined;
    }
    await runOnboarding(
      { db, botId: demo.bot_id, userId, url: demo.mode === "rendered" ? null : demo.final_url ?? demo.source_url, ownerNotes, maxPages: demo.max_pages, draft: true, selfServe: true, skipSafetyCheck: true, budgetMs },
      (e) => {
        // Progress is for the admin's list: write at most once a second.
        if (e.stage === "page" && Date.now() - last < 1000) return;
        last = Date.now();
        void setDemo(db, demo.id, { progress: e.stage === "page" ? `Reading page ${e.count ?? ""}: ${e.message}`.slice(0, 200) : e.message.slice(0, 200) });
      },
    );
    // The drafting step renames the org's business type; the name stays the one we picked.
    const { count } = await db.from("knowledge_sources").select("id", { count: "exact", head: true }).eq("bot_id", demo.bot_id).eq("status", "approved");
    if (!count) {
      // Nothing could be drafted (very thin site): let the raw pages answer instead of an empty assistant.
      await db.from("knowledge_sources").update({ status: "approved" }).eq("bot_id", demo.bot_id).eq("type", "page");
    }
    await setDemo(db, demo.id, { status: "ready", progress: null, error: null });
    return true;
  } catch (e) {
    console.error("[demo] train", demo.id, e instanceof Error ? e.message : e);
    await setDemo(db, demo.id, { status: "failed", error: "The homepage was copied, but training the assistant failed. Press Retrain.", progress: null });
    return false;
  }
}

/** The slow part of creating a demo: copy, then train. Runs after the response is sent. */
export async function buildDemo(db: SupabaseClient, demo: DemoSiteRow, opts: { nameGiven: boolean; userId: string; forceRender?: boolean; budgetMs?: number }): Promise<void> {
  const started = Date.now();
  if (!(await copyHomepage(db, demo, opts))) return;
  await trainDemo(db, demo, opts.userId, (opts.budgetMs ?? 270_000) - (Date.now() - started));
}

export async function getDemo(db: SupabaseClient, id: string): Promise<DemoSiteRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("demo_sites").select("*").eq("id", id).maybeSingle();
  return (data as DemoSiteRow | null) ?? null;
}

/** Moves the expiry, and the reply gate with it. */
export async function setDemoExpiry(db: SupabaseClient, demo: DemoSiteRow, expires: Date): Promise<void> {
  const iso = expires.toISOString();
  const live = expires.getTime() > Date.now();
  await setDemo(db, demo.id, { expires_at: iso, ...(live && demo.status === "expired" && demo.html ? { status: "ready" } : !live && demo.status === "ready" ? { status: "expired" } : {}) });
  await db.from("organizations").update({ trial_ends_at: iso }).eq("id", demo.org_id);
}

/** Deletes the demo with its assistant, knowledge, conversations and leads (all cascade from the org). */
export async function deleteDemo(db: SupabaseClient, demo: DemoSiteRow): Promise<void> {
  const { data: org } = await db.from("organizations").select("is_demo").eq("id", demo.org_id).maybeSingle();
  // Never delete an organization that isn't a demo, whatever the row says.
  if (org?.is_demo) await db.from("organizations").delete().eq("id", demo.org_id);
  else await db.from("demo_sites").delete().eq("id", demo.id);
}

/** Daily: expire demos past their date, free their HTML, and remove them for good 30 days later. */
export async function sweepDemos(db: SupabaseClient, now = new Date()): Promise<{ expired: number; deleted: number }> {
  const { data: due, error } = await db.from("demo_sites").select("id").in("status", ["ready", "failed", "pending", "copying", "training"]).lt("expires_at", now.toISOString());
  if (error) return { expired: 0, deleted: 0 }; // table not created yet
  if (due?.length) await db.from("demo_sites").update({ status: "expired", html: null, html_bytes: null, progress: null }).in("id", due.map((d) => d.id as string));
  const cutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const { data: old } = await db.from("demo_sites").select("*").eq("status", "expired").lt("expires_at", cutoff).limit(200);
  for (const d of (old ?? []) as DemoSiteRow[]) await deleteDemo(db, d);
  return { expired: due?.length ?? 0, deleted: old?.length ?? 0 };
}

/** "They opened it": sent once, the first time someone other than an admin views the demo. */
export async function notifyDemoOpened(db: SupabaseClient, demo: DemoSiteRow): Promise<void> {
  const { data: claimed } = await db.from("demo_sites").update({ opened_notified_at: new Date().toISOString() }).eq("id", demo.id).is("opened_notified_at", null).select("id");
  if (!claimed?.length) return;
  const to = process.env.ALERT_EMAIL || config.adminEmails[0];
  if (!to) return;
  const host = new URL(demo.final_url ?? demo.source_url).hostname.replace(/^www\./, "");
  const mail = brandEmail({
    tone: "success",
    badge: "&#128064;",
    eyebrow: "Demo opened",
    preheader: `Someone just opened the ${demo.business_name} demo. A good moment to follow up.`,
    heading: `${demo.business_name} opened their demo`,
    paragraphs: [`Someone just opened the preview you made for ${host}. This is a good moment to call or message them while it's on their screen.`],
    cta: { label: "See what they ask", url: `${config.appUrl}/app/bots/${demo.bot_id}/conversations` },
    secondary: [{ label: "Open the demo", url: demoUrl(demo.slug) }],
    panel: { title: "Demo", rows: [["Business", demo.business_name], ["Website", host], ["Expires", new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(demo.expires_at))]] },
    reason: "You're getting this because you created this demo in Botly's super admin.",
  });
  await sendEmail({ to, subject: `${demo.business_name} opened their demo`, ...mail });
}

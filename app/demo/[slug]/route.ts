import { after } from "next/server";
import { getSession } from "@/lib/auth";
import { demoConfig, notifyDemoOpened } from "@/lib/demo/service";
import { ORIGIN_TOKEN } from "@/lib/demo/snapshot";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { DemoSiteRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BASE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

/** A small Botly-styled page for "not ready yet" and "this preview has ended". Says nothing about any demo. */
function notice(title: string, body: string, status: number, refreshSeconds?: number): Response {
  const c = demoConfig.contact;
  const contact = [c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : "", c.phone ? `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}">${esc(c.phone)}</a>` : ""].filter(Boolean).join(" · ");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">${refreshSeconds ? `<meta http-equiv="refresh" content="${refreshSeconds}">` : ""}<title>${esc(title)} · Botly</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a}main{max-width:440px;margin:24px;padding:36px 32px;background:#fff;border:1px solid #e2e8f0;border-radius:18px;text-align:center}.m{display:inline-block;width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#4338ca);color:#fff;font-weight:800;font-size:19px;line-height:40px}h1{margin:18px 0 8px;font-size:22px;letter-spacing:-.02em}p{margin:0 0 6px;font-size:15px;line-height:1.6;color:#475569}a{color:#4f46e5;font-weight:600;text-decoration:none}.s{margin-top:18px;font-size:13px;color:#64748b}</style></head>
<body><main><span class="m">B</span><h1>${esc(title)}</h1><p>${esc(body)}</p>${contact ? `<p class="s">Questions? ${contact}</p>` : ""}<p class="s"><a href="/">botly.in</a></p></main></body></html>`;
  return new Response(html, { status, headers: { ...BASE_HEADERS, "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" } });
}

/** The demo page: the stored copy of a prospect's homepage, served as-is with a strict policy. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ended = () => notice("This preview has ended", "Previews are private and stay up for a limited time. If you'd like to see it again, ask the person who sent you the link.", 410);
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(slug)) return ended();

  let demo: DemoSiteRow | null = null;
  try {
    const { data } = await supabaseAdmin().from("demo_sites").select("*").eq("slug", slug).maybeSingle();
    demo = (data as DemoSiteRow | null) ?? null;
  } catch (e) {
    console.error("[demo]", e instanceof Error ? e.message : e);
  }
  if (!demo) return ended();
  if (demo.status === "pending" || demo.status === "copying" || demo.status === "training") {
    return notice("Your preview is being prepared", "We're reading the website and training the assistant. This page refreshes by itself; it usually takes two to four minutes.", 200, 6);
  }
  if (demo.status !== "ready" || !demo.html || new Date(demo.expires_at).getTime() <= Date.now()) return ended();

  // The admin checking their own demo is not "the prospect opened it".
  const session = await getSession().catch(() => null);
  if (!session?.isAdmin) {
    const row = demo;
    after(async () => {
      const db = supabaseAdmin();
      const { data: first, error } = await db.rpc("record_demo_view", { p_slug: row.slug });
      if (error) console.error("[demo] view", error.message);
      if (first === true) await notifyDemoOpened(db, row).catch((e) => console.error("[demo] opened email", e instanceof Error ? e.message : e));
    });
  }

  const origin = new URL(req.url).origin;
  let theirOrigin = "'none'";
  try {
    theirOrigin = new URL(demo.final_url ?? demo.source_url).origin;
  } catch {
    /* keep 'none' */
  }
  return new Response(demo.html.replaceAll(ORIGIN_TOKEN, origin), {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      // Their design loads from their servers (styles, images, fonts). Nothing of theirs can run:
      // only Botly's own scripts are allowed, so a script the clean-up missed is still dead.
      "Content-Security-Policy": [
        "default-src 'none'",
        "script-src 'self'",
        "script-src-attr 'none'",
        "style-src * 'unsafe-inline' data:",
        "img-src * data: blob:",
        "font-src * data:",
        "media-src * data: blob:",
        "connect-src 'self'",
        "object-src 'none'",
        "frame-src 'none'",
        "worker-src 'none'",
        "manifest-src 'none'",
        `base-uri ${theirOrigin}`,
        "form-action 'none'",
        "frame-ancestors 'self'",
      ].join("; "),
    },
  });
}

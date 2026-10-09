import { after } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { buildDemo, createDemo, demoConfig, demoUrl } from "@/lib/demo/service";
import { UnsafeUrlError } from "@/lib/demo/url-guard";
import { PostgresRateLimiter } from "@/lib/security/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.object({
  url: z.string().trim().min(3, "Enter a website address").max(500),
  businessName: z.string().trim().max(120).optional(),
  maxPages: z.coerce.number().int().min(1).max(40).default(15),
  days: z.coerce.number().int().refine((d) => [7, 14, 30].includes(d), "Pick 7, 14 or 30 days").optional(),
  forceRender: z.union([z.boolean(), z.literal("on")]).optional(),
});

/**
 * Creates a demo (super admin only). Answers as soon as the rows exist; the copy and
 * the training carry on after the response, and the admin list shows their progress.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });
  if (!session.isAdmin) return Response.json({ error: "Not allowed" }, { status: 403 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: p.error.issues[0]?.message ?? "Check the form" }, { status: 400 });

  const db = supabaseAdmin();
  const limit = await new PostgresRateLimiter(db).hit(`demo:create:${session.userId}`, 10, 3600);
  if (!limit.allowed) return Response.json({ error: "You've created 10 demos in the last hour. Try again a little later." }, { status: 429 });

  let demo;
  try {
    demo = await createDemo(db, {
      url: p.data.url,
      businessName: p.data.businessName || undefined,
      maxPages: p.data.maxPages,
      days: p.data.days ?? demoConfig.defaultDays,
      adminEmail: session.email,
      userId: session.userId,
    });
  } catch (e) {
    if (e instanceof UnsafeUrlError) return Response.json({ error: e.message }, { status: 400 });
    console.error("[demo] create", e instanceof Error ? e.message : e);
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't create the demo." }, { status: 500 });
  }
  const row = demo;
  after(() => buildDemo(db, row, { nameGiven: Boolean(p.data.businessName), userId: session.userId, forceRender: Boolean(p.data.forceRender) }));
  return Response.json({ ok: true, id: demo.id, url: demoUrl(demo.slug) });
}

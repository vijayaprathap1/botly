"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { copyHomepage, deleteDemo, getDemo, setDemoExpiry, trainDemo } from "@/lib/demo/service";
import { supabaseAdmin } from "@/lib/supabase/admin";

const PATH = "/app/admin/demos";

/** One action for the row buttons; every branch is super admin only. */
export async function demoAction(form: FormData) {
  const session = await requireAdmin();
  const db = supabaseAdmin();
  const demo = await getDemo(db, String(form.get("id") ?? ""));
  if (!demo) return;
  const action = String(form.get("action") ?? "");

  if (action === "extend") {
    // From today if it has already lapsed, so "+14 days" always means two more weeks of use.
    const base = Math.max(Date.now(), new Date(demo.expires_at).getTime());
    await setDemoExpiry(db, demo, new Date(base + 14 * 86_400_000));
  } else if (action === "expire") {
    await setDemoExpiry(db, demo, new Date());
  } else if (action === "delete") {
    await deleteDemo(db, demo);
  } else if (action === "recopy") {
    // Keeps the assistant and its knowledge; only the homepage copy is replaced.
    await db.from("demo_sites").update({ status: "copying", progress: "Copying the homepage…", error: null }).eq("id", demo.id);
    after(async () => {
      if (await copyHomepage(db, demo, { nameGiven: true, forceRender: demo.mode === "rendered", userId: session.userId })) await db.from("demo_sites").update({ status: "ready", progress: null }).eq("id", demo.id);
    });
  } else if (action === "retrain" || action === "retry") {
    await db.from("demo_sites").update({ status: demo.html ? "training" : "copying", progress: "Starting…", error: null }).eq("id", demo.id);
    after(async () => {
      const started = Date.now();
      if (!demo.html && !(await copyHomepage(db, demo, { nameGiven: true, userId: session.userId }))) return;
      await trainDemo(db, demo, session.userId, 270_000 - (Date.now() - started));
    });
  }
  revalidatePath(PATH);
}

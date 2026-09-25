import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function findBot(token: string) {
  if (!/^tt_[A-Za-z0-9_-]{20,200}$/.test(token)) return null;
  const { data } = await supabaseAdmin().from("bots").select("public_key, test_token, branding, org:organizations(name)").eq("test_token", token).maybeSingle();
  return data as { public_key: string; test_token: string; branding: { assistant_name?: string }; org: { name: string } } | null;
}

export async function generateMetadata({ params }: { params: Promise<{ testToken: string }> }): Promise<Metadata> {
  const bot = await findBot((await params).testToken);
  return {
    title: bot ? `${bot.org.name} assistant (private test)` : "Not found",
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    referrer: "no-referrer",
  };
}

/** P8: private, unlisted, full-screen test page. Works for draft bots. */
export default async function TestPage({ params }: { params: Promise<{ testToken: string }> }) {
  const bot = await findBot((await params).testToken);
  if (!bot) notFound();
  return (
    <>
      <noscript>This test page needs JavaScript.</noscript>
      <script src="/widget.js" data-key={bot.public_key} data-test-token={bot.test_token} data-mode="fullscreen" async />
    </>
  );
}

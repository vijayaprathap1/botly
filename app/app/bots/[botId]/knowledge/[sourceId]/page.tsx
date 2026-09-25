import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { SourceForm } from "../source-form";

export default async function EditSourcePage({ params }: { params: Promise<{ botId: string; sourceId: string }> }) {
  await requireAdmin();
  const { botId, sourceId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sourceId)) notFound();
  const db = await supabaseServer();
  const { data } = await db.from("knowledge_sources").select("id, type, title, url, content, status").eq("id", sourceId).eq("bot_id", botId).maybeSingle();
  if (!data) notFound();
  return (
    <>
      <PageHeader title="Edit knowledge" />
      <SourceForm botId={botId} source={data} />
    </>
  );
}

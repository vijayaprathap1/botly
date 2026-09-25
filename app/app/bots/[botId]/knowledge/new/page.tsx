import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { SourceForm } from "../source-form";

export default async function NewSourcePage({ params }: { params: Promise<{ botId: string }> }) {
  await requireAdmin();
  const { botId } = await params;
  return (
    <>
      <PageHeader title="Add knowledge" />
      <SourceForm botId={botId} source={null} />
    </>
  );
}

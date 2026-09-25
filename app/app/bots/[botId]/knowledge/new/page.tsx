import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { SourceForm } from "../source-form";

export default async function NewSourcePage({ params }: { params: Promise<{ botId: string }> }) {
  const session = await requireSession();
  const { botId } = await params;
  return (
    <>
      <PageHeader level={2} title="Add knowledge" />
      <SourceForm botId={botId} source={null} />
    </>
  );
}

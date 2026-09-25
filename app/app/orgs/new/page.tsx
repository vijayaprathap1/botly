import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { config } from "@/lib/config";
import { NewClientForm } from "./form";

export default async function NewClientPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="New client" sub="Creates the business and its website assistant. Next you'll paste their website to draft the knowledge." />
      <NewClientForm starterQuota={config.defaultQuota("starter")} growthQuota={config.defaultQuota("growth")} />
    </>
  );
}

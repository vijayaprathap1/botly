import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { config } from "@/lib/config";
import { getBot } from "@/lib/dashboard";
import { OnboardingWizard } from "./wizard";

export default async function OnboardingPage({ params }: { params: Promise<{ botId: string }> }) {
  await requireAdmin();
  const { botId } = await params;
  const bot = await getBot(botId);
  return (
    <>
      <PageHeader
        title="Onboarding"
        sub="Paste the website. Botly reads up to 40 pages (sitemap first, respecting robots.txt), pulls Shopify products, and drafts FAQs, a policy summary and a tone line. Everything stays a draft until you approve it."
      />
      <OnboardingWizard botId={bot.id} defaultUrl={bot.website_url ?? ""} maxPages={config.crawlMaxPages} />
    </>
  );
}

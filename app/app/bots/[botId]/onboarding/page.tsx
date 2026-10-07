import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { getBot } from "@/lib/dashboard";
import { planDef } from "@/lib/plans";
import { OnboardingWizard } from "./wizard";

export default async function OnboardingPage({ params }: { params: Promise<{ botId: string }> }) {
  const session = await requireSession();
  const { botId } = await params;
  const bot = await getBot(botId);
  // Same rule as /api/admin/onboard: customers' imports are approved automatically, within their plan's page limit.
  const selfServe = !session.isAdmin || Boolean(bot.org.self_serve);
  return (
    <>
      <PageHeader level={2}
        title={selfServe ? "Import from your website" : "Onboarding"}
        sub={selfServe
          ? "Paste your website. We read its public pages (and Shopify products) and write FAQs, a policy summary and your business profile into your assistant's knowledge. Running it again adds what's new without duplicating."
          : "Paste the website. Botly reads up to 40 pages (sitemap first, respecting robots.txt), pulls Shopify products, and drafts FAQs, a policy summary and a tone line. Everything stays a draft until you approve it."}
      />
      <OnboardingWizard botId={bot.id} defaultUrl={bot.website_url ?? ""} maxPages={selfServe ? Math.min(config.crawlMaxPages, planDef(bot.org.plan).crawlPages) : config.crawlMaxPages} selfServe={selfServe} />
    </>
  );
}

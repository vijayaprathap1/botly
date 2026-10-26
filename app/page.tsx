import type { Metadata, Viewport } from "next";
import { SPOKEN_LANGUAGES } from "@/lib/business";
import { paidPlans, TRIAL } from "@/lib/plans";
import { homeFontVars } from "@/components/home/fonts";
import { HomeNav } from "@/components/home/nav";
import { Hero } from "@/components/home/hero";
import { FinalCta, HowItWorks, Languages, Leads, Trust, WorksOn } from "@/components/home/sections";
import { Pricing } from "@/components/home/pricing";
import { Faq } from "@/components/home/faq";
import { HomeFooter } from "@/components/home/footer";

export const metadata: Metadata = {
  // absolute: the layout's "%s · Botly" template would repeat the brand.
  title: { absolute: "Botly: AI customer support in your customers' language" },
  description: `AI support assistant trained on your website. Answers customers in English, Tamil and Hindi and emails you every lead. Free ${TRIAL.days}-day trial.`,
  robots: { index: true, follow: true },
  // One address for search engines: the old vercel.app host and www serve the same page.
  alternates: { canonical: "/" },
  openGraph: { title: "Botly · AI customer support for Indian businesses", description: `Trained on your business. Answers in ${SPOKEN_LANGUAGES}. Emails you every lead.`, type: "website" },
  twitter: { card: "summary_large_image" },
};

// Cream browser chrome on the homepage only; the layout default (white) stays for the app.
export const viewport: Viewport = { themeColor: "#FFF7EC" };

export default function Landing() {
  const offers = paidPlans().map((p) => ({ "@type": "Offer", name: p.name, price: p.priceInr, priceCurrency: "INR", category: "subscription" }));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Botly",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://botly.in",
    description: `An AI assistant trained on your business that answers website visitors in ${SPOKEN_LANGUAGES} and emails you every lead.`,
    offers: [{ "@type": "Offer", name: "Free trial", price: 0, priceCurrency: "INR" }, ...offers],
  };
  return (
    <div id="top" className={`home ${homeFontVars} min-h-screen text-[16px] leading-[1.6] wsm:text-[17px]`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <a
        href="#main"
        className="sr-only z-[60] rounded-full bg-ink px-5 py-3 font-bold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <HomeNav />
      <main id="main">
        <Hero />
        <WorksOn />
        <HowItWorks />
        <Languages />
        <Leads />
        <Trust />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <HomeFooter />
      <script src="/widget.js" data-key="pk_d613ae9530884c74b420b42c" async></script>
    </div>
  );
}

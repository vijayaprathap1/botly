import type { Metadata, Viewport } from "next";
import { SPOKEN_LANGUAGES } from "@/lib/business";
import { plans } from "@/lib/plans";
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
  description: `AI support assistant trained on your website. Answers customers in English, Tamil and Hindi and emails you every lead. Free plan, paid plans from ₹${plans().starter.priceInr.toLocaleString("en-IN")}/month.`,
  robots: { index: true, follow: true },
  // One address for search engines: the old vercel.app host and www serve the same page.
  alternates: { canonical: "/" },
  openGraph: { title: "Botly · AI customer support for Indian businesses", description: `Trained on your business. Answers in ${SPOKEN_LANGUAGES}. Emails you every lead.`, type: "website" },
  twitter: { card: "summary_large_image" },
};

// Cream browser chrome on the homepage only; the layout default (white) stays for the app.
export const viewport: Viewport = { themeColor: "#FFF7EC" };

export default function Landing() {
  const all = plans();
  const offers = (["free", "starter", "growth", "pro"] as const).map((id) => ({ "@type": "Offer", name: all[id].name, price: all[id].priceInr, priceCurrency: "INR", category: id === "free" ? "free" : "subscription" }));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Botly",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://botly.in",
    description: `An AI assistant trained on your business that answers website visitors in ${SPOKEN_LANGUAGES} and emails you every lead.`,
    offers,
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
    </div>
  );
}

import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/shell";
import { SupportEmail, SupportPhone, SupportWhatsApp } from "@/components/marketing/support-contact";
import { business, SPOKEN_LANGUAGES } from "@/lib/business";

export const metadata: Metadata = {
  title: "About",
  description: "Botly is an AI customer-support chat assistant for Indian small businesses and online stores.",
  robots: { index: true, follow: true },
};

export default function About() {
  const { name, address, city } = business;
  const addressLine = address.trim();
  const cityLine = process.env.BUSINESS_CITY?.trim() ? `${city}, India` : "";
  return (
    <MarketingShell>
      <main className="mx-auto max-w-3xl px-4 py-12 text-[15px] leading-relaxed text-zinc-800">
        <h1 className="text-3xl font-bold">About</h1>
        <p className="mt-4">
          Botly is an AI customer-support chat assistant for Indian small businesses and online stores. You add it to a website with one line of code. It answers customers in {SPOKEN_LANGUAGES}.
        </p>

        <h2 className="mt-8 text-lg font-semibold">Who operates Botly</h2>
        <p>Botly is operated by {name}.</p>
        {addressLine ? <p className="mt-2">{addressLine}</p> : null}
        {cityLine && !addressLine.includes(city) ? <p className="mt-2">{cityLine}</p> : null}

        <h2 className="mt-8 text-lg font-semibold">Contact</h2>
        <p>
          Email <SupportEmail className="underline" /> or call <SupportPhone className="underline" />.{" "}
          <SupportWhatsApp className="underline">Chat with us on WhatsApp</SupportWhatsApp>.
        </p>
      </main>
    </MarketingShell>
  );
}

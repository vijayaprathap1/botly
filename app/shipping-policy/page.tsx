import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/shell";
import { SupportEmail, SupportPhone, SupportWhatsApp } from "@/components/marketing/support-contact";
import { business } from "@/lib/business";
import { POLICIES_LAST_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Shipping & Delivery Policy",
  description: "Botly is a digital subscription. Access is delivered online when you create an account, and paid features activate when payment is confirmed. No physical goods are shipped.",
  robots: { index: true, follow: true },
};

export default function ShippingPolicy() {
  const { name, address, city } = business;
  const addressLine = address.trim();
  const cityLine = process.env.BUSINESS_CITY?.trim() ? `${city}, India` : "";
  const place = addressLine || cityLine;
  return (
    <MarketingShell>
      <main className="mx-auto max-w-3xl px-4 py-12 text-[15px] leading-relaxed text-zinc-800">
        <h1 className="text-3xl font-bold">Shipping &amp; Delivery Policy</h1>
        <p className="mt-2 text-sm text-zinc-500">Applies to Botly subscriptions sold by {name}{place ? `, ${place}` : ""}. Last updated {POLICIES_LAST_UPDATED}.</p>

        <h2 className="mt-8 text-lg font-semibold">No physical goods</h2>
        <p>Botly is a digital software subscription. {name} does not ship physical goods, and there is nothing to deliver by courier.</p>

        <h2 className="mt-6 text-lg font-semibold">How access is delivered</h2>
        <p>Access is delivered instantly online when the account is created. Paid-plan features activate as soon as payment is confirmed.</p>

        <h2 className="mt-6 text-lg font-semibold">If activation fails</h2>
        <p>
          Email <SupportEmail className="underline" />, call <SupportPhone className="underline" />, or <SupportWhatsApp className="underline">chat with us on WhatsApp</SupportWhatsApp>. Refunds follow our{" "}
          <Link className="underline" href="/refund-policy">Refund and Cancellation Policy</Link>.
        </p>
      </main>
    </MarketingShell>
  );
}

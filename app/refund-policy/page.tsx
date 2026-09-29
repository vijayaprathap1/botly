import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/shell";
import { business } from "@/lib/business";
import { TRIAL } from "@/lib/plans";

export const metadata: Metadata = { title: "Refund and Cancellation Policy · Botly", robots: { index: true, follow: true } };

// TEMPLATE: have a lawyer review before relying on it.
export default function RefundPolicy() {
  const { name, email } = business;
  return (
    <MarketingShell>
      <main className="mx-auto max-w-3xl px-4 py-12 text-[15px] leading-relaxed text-zinc-800">
        <h1 className="text-3xl font-bold">Refund and Cancellation Policy</h1>
        <p className="mt-2 text-sm text-zinc-500">Applies to Botly subscriptions sold by {name}. Last updated {new Date().getFullYear()}.</p>

        <h2 className="mt-8 text-lg font-semibold">Free trial first</h2>
        <p>Every new account gets a free trial of {TRIAL.days} days including {TRIAL.replies} AI replies, with no card required, so you can check the assistant on your own business before paying.</p>

        <h2 className="mt-6 text-lg font-semibold">How billing works</h2>
        <p>Paid plans are monthly subscriptions, charged in advance through Razorpay (cards, UPI AutoPay or netbanking e-mandate), plus applicable GST. Each plan renews automatically every month until you cancel. Razorpay emails you a receipt for every charge.</p>

        <h2 className="mt-6 text-lg font-semibold">Cancelling</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>Cancel any time from <b>Plan &amp; billing</b> in your dashboard, or by emailing <a className="underline" href={`mailto:${email}`}>{email}</a>.</li>
          <li>You won&apos;t be charged again. Your plan stays active until the end of the month you have already paid for.</li>
          <li>After that, the assistant on your website shows your contact details instead of AI replies. Your data stays available to export for the retention period in our <Link className="underline" href="/privacy-policy">Privacy Policy</Link>.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold">Refunds</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>Monthly fees already paid are not refunded for partly used months, because the service is available immediately and the trial lets you evaluate it first.</li>
          <li>We refund in full if you were charged twice for the same period, charged after a cancellation took effect, or charged because of an error on our side.</li>
          <li>If the service was unavailable for more than 3 consecutive days in a paid month because of a fault on our side, we refund that month on request.</li>
          <li>When you switch plans, the new plan starts immediately and the old one stops. The unused part of the old plan is not refunded.</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold">How to request a refund</h2>
        <p>Email <a className="underline" href={`mailto:${email}`}>{email}</a> within 30 days of the charge, with your account email and the Razorpay payment ID from your receipt. We reply within 3 working days. Approved refunds go back to the original payment method through Razorpay, usually within 5–7 working days, depending on your bank.</p>

        <p className="mt-8">See also our <Link className="underline" href="/terms">Terms of Service</Link> and <Link className="underline" href="/contact">Contact</Link> page.</p>
      </main>
    </MarketingShell>
  );
}

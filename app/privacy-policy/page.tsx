import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/shell";
import { aiProcessorName } from "@/lib/llm/provider";

export const metadata: Metadata = { title: "Privacy Policy · Botly", robots: { index: true, follow: true } };

// TEMPLATE: have a lawyer review (India DPDP Act 2023). Visitors to customers' sites have their own notice at /privacy.
export default function PrivacyPolicy() {
  const name = process.env.BUSINESS_LEGAL_NAME || "Botly";
  const email = process.env.SUPPORT_EMAIL || "support@your-domain";
  return (
    <MarketingShell>
      <main className="mx-auto max-w-3xl px-4 py-12 text-[15px] leading-relaxed text-zinc-800">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-zinc-500">How {name} handles personal data of businesses that use Botly. For people chatting with an assistant on a business&apos;s website, see the <a className="underline" href="/privacy">chat privacy notice</a>.</p>
        <h2 className="mt-8 text-lg font-semibold">What we collect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Account data: your email address and sign-in details from Google or other providers you choose.</li>
          <li>Business information you give us, and text from your business&apos;s public website pages.</li>
          <li>Billing data handled by Razorpay. We don&apos;t store your card or UPI details.</li>
          <li>Usage data: conversations with your assistant, leads, and technical logs.</li>
          <li>If you arrive from an ad or a link, the campaign parameters (source, medium, campaign, content and term), the page you landed on, and the referring site. These are kept in your browser&apos;s local storage on this website, not in a cookie. They are sent once when you create a workspace and stored on that workspace. If there is no campaign, the source is recorded as direct.</li>
        </ul>
        <h2 className="mt-6 text-lg font-semibold">Why we use it</h2>
        <p>To provide and improve the service, bill you, keep it secure, and contact you about your account. We don&apos;t sell personal data.</p>
        <h2 className="mt-6 text-lg font-semibold">Who processes it</h2>
        <p>Supabase (database and sign-in), Vercel (hosting), {aiProcessorName()} (generating AI replies), Resend (email), Meta WhatsApp (lead alerts, if enabled), Razorpay (payments) and Cloudflare (Web Analytics on this website and the signed-in app). Data may be processed outside India by these providers.</p>
        <h2 className="mt-6 text-lg font-semibold">Analytics</h2>
        <p>Botly&apos;s own marketing pages and the signed-in app use Cloudflare Web Analytics. It is cookieless: it counts page views without identifying you and without a consent banner. It is not loaded inside the chat widget embedded on a customer&apos;s website. We don&apos;t use Google Analytics. The campaign fields described above stay in first-party local storage until you create a workspace or clear site data. We don&apos;t sell them or share them with advertisers.</p>
        <h2 className="mt-6 text-lg font-semibold">How long we keep it</h2>
        <p>Conversations and leads are kept for 12 months by default (you can shorten this). Account data is kept while your account is open and deleted within 90 days of closure, except records we must keep by law.</p>
        <h2 className="mt-6 text-lg font-semibold">Your rights</h2>
        <p>You can access, correct, export or delete your data, and withdraw consent, by writing to <a className="underline" href={`mailto:${email}`}>{email}</a>. We respond within 30 days.</p>
        <h2 className="mt-6 text-lg font-semibold">Grievance officer</h2>
        <p>{process.env.GRIEVANCE_OFFICER || "Name to be added"} · <a className="underline" href={`mailto:${email}`}>{email}</a></p>
      </main>
    </MarketingShell>
  );
}

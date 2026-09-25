import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/shell";
import { fmtInr, paidPlans, TRIAL } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Botly · AI chat assistant for your business website",
  description: "An assistant trained on your website that answers customers in English, Tamil and Hindi, 24/7, and sends you leads on WhatsApp and email. One line to install.",
  robots: { index: true, follow: true },
};

const STEPS = [
  ["Tell us where you are online", "Your website, Instagram, Facebook, LinkedIn or Google profile, plus anything customers always ask."],
  ["We write your assistant's knowledge", "We read your public pages and build a business profile and FAQs in about 2 minutes. You can edit anything."],
  ["Try it, then paste one line", "Chat with it yourself first. When you're happy, add one line of code to Shopify, WordPress, Wix or any site."],
];
const FEATURES = [
  ["Answers only from your facts", "No invented prices or promises. If it doesn't know, it says so and offers to connect the customer to you."],
  ["English, Tamil, Hindi, Hinglish", "Replies in the customer's own language and script, even when your website is in English."],
  ["Leads to WhatsApp and email", "Bulk orders, 'talk to a person', callback requests: name and phone number straight to you."],
  ["Learns what customers ask", "Questions it couldn't answer are collected for you. Answer once, and it knows from then on."],
  ["Order status (Growth)", "Customers check Shopify or WooCommerce orders after verifying their phone or email."],
  ["Your data stays yours", "Conversations visible only to you. Export any time. Delete a customer's data on request."],
];
const FAQ = [
  ["Do I need a website?", "No. You can start from your Instagram or Google profile details and what you type in. A website gives it more to learn from."],
  ["Will it make things up?", "It's instructed to answer only from your approved knowledge, and it's tested against tricks like fake discount requests before it goes live."],
  ["What happens after the free trial?", `Your ${TRIAL.days}-day trial includes ${TRIAL.replies} AI replies. After that, visitors see your phone, WhatsApp and email instead of AI replies until you pick a plan.`],
  ["Can I cancel?", "Yes, any time from Billing. Your plan runs until the end of the month you paid for."],
];

export default function Landing() {
  return (
    <MarketingShell>
      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:pt-20">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-brand-700">AI customer support for Indian businesses</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">An assistant that knows your business and answers customers in their language, 24/7.</h1>
            <p className="mt-5 text-lg text-slate-600">
              Trained on your website and social profiles. Answers questions about products, prices, delivery and returns, and sends you the leads.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/login?signup=1" className="rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">Build my assistant free</Link>
              <Link href="#how" className="rounded-xl border border-slate-300 px-5 py-3 font-semibold hover:bg-slate-50">See how it works</Link>
            </div>
            <p className="mt-3 text-sm text-slate-500">{TRIAL.days}-day free trial · {TRIAL.replies} AI replies · no card needed</p>
          </div>
        </section>

        <section id="how" className="border-y border-slate-100 bg-slate-50 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-bold tracking-tight">Ready in about 5 minutes</h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
                  <h3 className="mt-3 font-semibold">{t}</h3>
                  <p className="mt-1 text-sm text-slate-600">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-bold tracking-tight">Built for how Indian customers ask</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([t, d]) => (
              <div key={t}>
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-slate-600">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="border-t border-slate-100 bg-slate-50 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-bold tracking-tight">Simple pricing</h2>
            <p className="mt-1 text-slate-600">Start free. Pick a plan when your assistant is earning its keep. Prices exclude GST.</p>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="font-semibold">Free trial</h3>
                <p className="mt-2 text-3xl font-bold">₹0</p>
                <p className="mt-1 text-sm text-slate-600">{TRIAL.replies} AI replies over {TRIAL.days} days</p>
                <ul className="mt-4 space-y-1 text-sm"><li>✓ Assistant built from your profiles</li><li>✓ Preview and install</li><li>✓ Leads by email</li></ul>
                <Link href="/login?signup=1" className="mt-6 block rounded-lg border border-slate-300 px-4 py-2 text-center font-semibold hover:bg-slate-50">Start free</Link>
              </div>
              {paidPlans().map((p) => (
                <div key={p.id} className={`rounded-2xl border bg-white p-6 ${p.id === "growth" ? "border-brand-600 ring-1 ring-brand-600" : "border-slate-200"}`}>
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="mt-2 text-3xl font-bold">{fmtInr(p.priceInr)}<span className="text-base font-normal text-slate-500">/month</span></p>
                  <p className="mt-1 text-sm text-slate-600">{p.blurb}</p>
                  <ul className="mt-4 space-y-1 text-sm">{p.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
                  <Link href="/login?signup=1" className="mt-6 block rounded-lg bg-brand-600 px-4 py-2 text-center font-semibold text-white hover:bg-brand-700">Start with a free trial</Link>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-slate-600">Want us to set it up for you? We also offer a done-for-you service with monthly tuning. {process.env.SUPPORT_EMAIL ? <a className="underline" href={`mailto:${process.env.SUPPORT_EMAIL}`}>Contact us</a> : null}</p>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-2xl font-bold tracking-tight">Questions</h2>
          <dl className="mt-6 space-y-5">
            {FAQ.map(([q, a]) => (
              <div key={q}><dt className="font-semibold">{q}</dt><dd className="mt-1 text-slate-600">{a}</dd></div>
            ))}
          </dl>
          <Link href="/login?signup=1" className="mt-10 inline-block rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">Build my assistant free</Link>
        </section>
      </main>
      {process.env.NEXT_PUBLIC_DEMO_BOT_KEY ? <script src="/widget.js" data-key={process.env.NEXT_PUBLIC_DEMO_BOT_KEY} async /> : null}
    </MarketingShell>
  );
}

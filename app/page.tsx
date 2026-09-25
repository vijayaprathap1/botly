import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, Globe2, Inbox, Languages, MessageCircle, PackageSearch, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { MarketingShell } from "@/components/marketing/shell";
import { ProductMock } from "@/components/marketing/product-mock";
import { fmtInr, paidPlans, TRIAL } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Botly · AI customer support that speaks your customers' language",
  description: "An AI assistant trained on your website and social profiles. Answers customers in English, Tamil and Hindi, 24/7, and sends you leads on WhatsApp and email. One line to install.",
  robots: { index: true, follow: true },
  openGraph: { title: "Botly · AI customer support for Indian businesses", description: "Trained on your business. Answers in English, Tamil and Hindi. Leads to WhatsApp.", type: "website" },
};

const STEPS = [
  { t: "Tell us where you are online", d: "Your website, Instagram, Facebook, LinkedIn or Google profile, plus anything customers always ask about.", icon: Globe2 },
  { t: "We write your assistant's knowledge", d: "We read your public pages and build a business profile and FAQs in about two minutes. Edit anything.", icon: Sparkles },
  { t: "Try it, then paste one line", d: "Chat with it yourself first. When you're happy, add one line of code to Shopify, WordPress, Wix or any site.", icon: Zap },
];
const FEATURES = [
  { t: "Answers only from your facts", d: "No invented prices or promises. If it doesn't know, it says so and offers to connect the customer to you.", icon: ShieldCheck, big: true },
  { t: "English, Tamil, Hindi, Hinglish", d: "Replies in the customer's own language and script, even when your website is only in English.", icon: Languages, big: true },
  { t: "Leads to WhatsApp and email", d: "Bulk orders, “talk to a person”, callbacks: name and phone number straight to you, in seconds.", icon: MessageCircle },
  { t: "Learns what customers ask", d: "Unanswered questions are collected for you. Answer once, and it knows from then on.", icon: Inbox },
  { t: "Order status lookup", d: "Shopify and WooCommerce order tracking, after the customer verifies their phone or email.", icon: PackageSearch },
  { t: "Monthly reports", d: "Top questions, languages, busiest hours, leads and the hours of replies it saved you.", icon: BarChart3 },
];
const FAQ = [
  ["Do I need a website?", "No. You can start from your Instagram or Google profile details and what you type in. A website gives it more to learn from."],
  ["Will it make things up?", "It's instructed to answer only from your approved information, and it's tested against tricks like fake discount requests before it goes live. If it doesn't know, it says so."],
  ["Which languages does it speak?", "English, Tamil and Hindi, including mixed messages like Hinglish and Tanglish. It replies in the same language and script the customer used."],
  ["What happens after the free trial?", `Your ${TRIAL.days}-day trial includes ${TRIAL.replies} AI replies. After that, visitors see your phone, WhatsApp and email instead of AI replies until you pick a plan. Nothing breaks on your site.`],
  ["Can I cancel any time?", "Yes, from Billing. Your plan runs until the end of the month you paid for."],
  ["Is my customers' data safe?", "Conversations are visible only to you and our support team. You can export everything and delete a customer's data on request."],
];

export default function Landing() {
  return (
    <MarketingShell>
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" aria-hidden />
          <div className="mx-auto max-w-6xl px-5 pb-16 pt-16 text-center sm:pt-24">
            <Link href="/login?signup=1" className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[12.5px] font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300">
              <span className="rounded-full bg-brand-600 px-1.5 py-px text-[10.5px] font-semibold text-white">New</span>
              Speaks Tamil, Hindi and Hinglish <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
            </Link>
            <h1 className="mx-auto mt-6 max-w-4xl text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-zinc-950 sm:text-[64px]">
              Customer support that knows your business, in your customers&apos; language
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-zinc-600 sm:text-[19px]">
              An AI assistant trained on your website and social profiles. It answers questions about products, prices, delivery and returns around the clock, and sends you the leads.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/login?signup=1" className="inline-flex h-12 items-center gap-2 rounded-xl bg-zinc-950 px-6 text-[15px] font-medium text-white shadow-lg shadow-zinc-950/10 transition hover:bg-zinc-800">
                Build my assistant free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="#how" className="inline-flex h-12 items-center rounded-xl border border-zinc-200 bg-white px-6 text-[15px] font-medium text-zinc-900 transition hover:bg-zinc-50">See how it works</Link>
            </div>
            <p className="mt-4 text-[13px] text-zinc-500">{TRIAL.days}-day free trial · {TRIAL.replies} AI replies · No card needed</p>
          </div>
          <div className="px-5 pb-20"><ProductMock /></div>
        </section>

        {/* Works with */}
        <section className="border-y border-zinc-100 bg-zinc-50/60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-7 text-[14px] font-medium text-zinc-400">
            <span className="text-[12px] font-medium uppercase tracking-wider text-zinc-500">Works on</span>
            <span>Shopify</span><span>WordPress</span><span>WooCommerce</span><span>Wix</span><span>Webflow</span><span>Any HTML site</span>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-brand-600">How it works</p>
          <h2 className="mt-3 max-w-2xl text-[32px] font-semibold leading-tight tracking-[-0.03em] sm:text-[40px]">Live on your website in about five minutes</h2>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.t} className="relative rounded-2xl border border-zinc-200 bg-white p-6 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100"><s.icon className="h-5 w-5" /></span>
                  <span className="font-mono text-[12px] text-zinc-400">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-[16px] font-semibold tracking-[-0.01em]">{s.t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 bg-zinc-950 py-24 text-white">
          <div className="mx-auto max-w-6xl px-5">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-brand-300">Built for how Indian customers ask</p>
            <h2 className="mt-3 max-w-2xl text-[32px] font-semibold leading-tight tracking-[-0.03em] sm:text-[40px]">Everything a good shop assistant does, without the waiting</h2>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <div key={f.t} className={`rounded-2xl border border-white/10 bg-white/[0.04] p-6 ${f.big ? "lg:col-span-2" : ""}`}>
                  <f.icon className="h-5 w-5 text-brand-300" />
                  <h3 className="mt-4 text-[15.5px] font-semibold">{f.t}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
          <div className="text-center">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-brand-600">Pricing</p>
            <h2 className="mt-3 text-[32px] font-semibold tracking-[-0.03em] sm:text-[40px]">Start free. Upgrade when it pays for itself.</h2>
            <p className="mt-3 text-[15px] text-zinc-600">Monthly plans, cancel any time. Prices exclude GST.</p>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-7">
              <h3 className="text-[15px] font-semibold">Free trial</h3>
              <p className="mt-1 text-[13.5px] text-zinc-500">See it working on your business</p>
              <p className="mt-6 text-[40px] font-semibold tracking-[-0.03em]">₹0</p>
              <p className="text-[13px] text-zinc-500">{TRIAL.replies} AI replies over {TRIAL.days} days</p>
              <ul className="mt-6 flex-1 space-y-2.5 text-[14px] text-zinc-700">
                {["Assistant built from your profiles", "Live preview and install code", "Leads by email"].map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 flex-none text-zinc-400" />{f}</li>)}
              </ul>
              <Link href="/login?signup=1" className="mt-8 inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 font-medium hover:bg-zinc-50">Start free</Link>
            </div>
            {paidPlans().map((p) => {
              const hot = p.id === "growth";
              return (
                <div key={p.id} className={`relative flex flex-col rounded-2xl p-7 ${hot ? "bg-zinc-950 text-white shadow-[var(--shadow-float)]" : "border border-zinc-200 bg-white"}`}>
                  {hot ? <span className="absolute -top-3 left-7 rounded-full bg-brand-600 px-2.5 py-0.5 text-[11.5px] font-semibold text-white">Most popular</span> : null}
                  <h3 className="text-[15px] font-semibold">{p.name}</h3>
                  <p className={`mt-1 text-[13.5px] ${hot ? "text-zinc-400" : "text-zinc-500"}`}>{p.blurb}</p>
                  <p className="mt-6 text-[40px] font-semibold tracking-[-0.03em]">{fmtInr(p.priceInr)}<span className={`text-[15px] font-normal ${hot ? "text-zinc-400" : "text-zinc-500"}`}>/month</span></p>
                  <p className={`text-[13px] ${hot ? "text-zinc-400" : "text-zinc-500"}`}>{p.conversations.toLocaleString("en-IN")} conversations a month</p>
                  <ul className={`mt-6 flex-1 space-y-2.5 text-[14px] ${hot ? "text-zinc-200" : "text-zinc-700"}`}>
                    {p.features.map((f) => <li key={f} className="flex gap-2"><Check className={`mt-0.5 h-4 w-4 flex-none ${hot ? "text-brand-300" : "text-brand-600"}`} />{f}</li>)}
                  </ul>
                  <Link href="/login?signup=1" className={`mt-8 inline-flex h-10 items-center justify-center rounded-lg font-medium ${hot ? "bg-white text-zinc-950 hover:bg-zinc-100" : "bg-zinc-950 text-white hover:bg-zinc-800"}`}>Start with a free trial</Link>
                </div>
              );
            })}
          </div>
          <p className="mt-8 text-center text-[13.5px] text-zinc-500">
            Want us to set it up and tune it for you every month? Ask about our done-for-you service.{process.env.SUPPORT_EMAIL ? <> <a className="font-medium text-zinc-900 underline underline-offset-4" href={`mailto:${process.env.SUPPORT_EMAIL}`}>Contact us</a></> : null}
          </p>
        </section>

        {/* FAQ */}
        <section className="border-t border-zinc-100 bg-zinc-50/60">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-24 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <h2 className="text-[32px] font-semibold tracking-[-0.03em]">Questions</h2>
              <p className="mt-3 text-[15px] text-zinc-600">Anything else? Start a trial and ask the assistant, or write to us.</p>
            </div>
            <div className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-zinc-900">
                    {q}
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-zinc-600">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-5 py-24">
          <div className="relative overflow-hidden rounded-3xl bg-brand-600 px-8 py-16 text-center text-white sm:px-16">
            <div className="bg-grid absolute inset-0 opacity-20 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden />
            <h2 className="relative mx-auto max-w-2xl text-[32px] font-semibold leading-tight tracking-[-0.03em] sm:text-[40px]">Your next customer is asking a question right now</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-[16px] text-brand-100">Build your assistant in five minutes. Free for {TRIAL.days} days.</p>
            <Link href="/login?signup=1" className="relative mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-[15px] font-medium text-zinc-950 shadow-lg transition hover:bg-zinc-100">
              Build my assistant free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      {process.env.NEXT_PUBLIC_DEMO_BOT_KEY ? <script src="/widget.js" data-key={process.env.NEXT_PUBLIC_DEMO_BOT_KEY} async /> : null}
    </MarketingShell>
  );
}

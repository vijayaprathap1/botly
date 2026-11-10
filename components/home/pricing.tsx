import Link from "next/link";
import { Check } from "lucide-react";
import { FOUNDING, fmtInr, foundingConfigured, PILOT, plans, TOPUP, TRIAL, type PlanDef } from "@/lib/plans";
import { SectionHead, btnLg, btnInk, btnOutline, btnSm, section, wrap } from "./ui";

/** Plan names, blurbs, prices and feature lists all come from lib/plans.ts. */
export function Pricing() {
  const { free, starter, growth, pro } = plans();
  const yearly = (p: PlanDef) => `or ${fmtInr(p.yearlyInr)}/year (2 months free)`;
  // The founding price is bought from Billing once its Razorpay plan exists; until then, by email.
  const foundingHref = foundingConfigured() ? "/login?signup=1&plan=growth&offer=founding" : "/contact";
  return (
    <section id="pricing" className={`${section} bg-cream-2`} aria-labelledby="pricing-title">
      <div className={wrap}>
        <SectionHead center eyebrow="Pricing" eyebrowClass="text-saffron-d" title={<span id="pricing-title">Start free. Upgrade when it&apos;s working.</span>}>
          <p>Simple plans in rupees. The price you see is the price you pay. Start on Free, no card needed, and cancel a paid plan any time.</p>
        </SectionHead>
        <div className="mx-auto mb-[26px] flex max-w-[820px] flex-col items-start justify-between gap-4 rounded-[24px] border-2 border-ink bg-white px-[26px] py-5 wsm:flex-row wsm:items-center" id="founding">
          <div>
            <b className="text-[17px]">Founding offer: the first {FOUNDING.slots} shops</b>
            <p className="text-[15px] text-ink-2">
              Get {growth.name} at <b className="text-ink">{fmtInr(FOUNDING.priceInr)}/month</b> instead of {fmtInr(growth.priceInr)}, locked for {FOUNDING.lockMonths} months.
            </p>
          </div>
          <Link href={foundingHref} className={`${btnSm} ${btnInk} flex-none`}>
            {foundingConfigured() ? "Claim founding price" : "Contact us"}
          </Link>
        </div>
        <div className="grid items-stretch gap-[30px] wmd:grid-cols-2 wlg:grid-cols-4 wmd:gap-[22px]">
          <PlanCard plan={free} price={fmtInr(0)} detail="Free for ever · no card needed" cta="Start free" href="/login?signup=1&plan=free" />
          <PlanCard plan={starter} price={fmtInr(starter.priceInr)} perMonth detail={yearly(starter)} cta={`Choose ${starter.name}`} href="/login?signup=1&plan=starter" />
          <PlanCard plan={growth} hot price={fmtInr(growth.priceInr)} perMonth detail={yearly(growth)} cta={`Choose ${growth.name}`} href="/login?signup=1&plan=growth" />
          <PlanCard plan={pro} price={fmtInr(pro.priceInr)} perMonth detail={yearly(pro)} cta={`Choose ${pro.name}`} href="/login?signup=1&plan=pro" />
        </div>
        <p className="mt-[30px] text-center text-[15.5px] text-ink-2">
          Need more in a busy month? Add {TOPUP.conversations.toLocaleString("en-IN")} conversations for {fmtInr(TOPUP.priceInr)}, any time from Billing.
        </p>
        <div className="mx-auto mt-[26px] flex max-w-[820px] flex-col items-start justify-between gap-5 rounded-[24px] border-2 border-dashed border-line bg-white px-[26px] py-5 wsm:flex-row wsm:items-center">
          <div>
            <b className="text-[17px]">Trial, pilot or done-for-you</b>
            <p className="text-[15px] text-ink-2">
              Want to try a paid plan first? Ask for a {TRIAL.days}-day trial, or a {PILOT.days}-day pilot with free setup. We can also set it up and tune it for you every month.
            </p>
          </div>
          <Link href="/contact" className={`${btnSm} ${btnOutline} flex-none`}>
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}

function PlanCard({
  plan,
  subtitle = plan.blurb,
  price,
  perMonth = false,
  detail,
  cta,
  href,
  hot = false,
}: {
  plan: PlanDef;
  subtitle?: string;
  price: string;
  perMonth?: boolean;
  detail: string;
  cta: string;
  href: string;
  hot?: boolean;
}) {
  const muted = hot ? "text-ink" : "text-ink-2";
  return (
    <div
      className={`relative flex flex-col rounded-[26px] p-6 wsm:rounded-[32px] wsm:p-8 ${
        hot ? "border-2 border-ink bg-marigold shadow-[6px_6px_0_#2B1D14] wsm:shadow-[10px_10px_0_#2B1D14]" : "border-[1.5px] border-line bg-white"
      }`}
    >
      {hot ? <span className="absolute -top-4 left-7 rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-extrabold text-white">For online stores</span> : null}
      <h3 className="font-display text-[26px] font-bold">{plan.name}</h3>
      <p className={`mt-0.5 text-[15px] ${muted}`}>{subtitle}</p>
      <p className="mt-6 font-display text-[48px] font-extrabold leading-none tracking-[-0.03em]">
        {price}
        {perMonth ? <small className={`ml-1 font-body text-[17px] font-semibold tracking-normal ${muted}`}>/month</small> : null}
      </p>
      <p className={`mt-2 text-[14.5px] font-semibold ${muted}`}>{detail}</p>
      <ul className="mb-7 mt-6 grid gap-[11px] text-[16px]">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check className={`mt-0.5 h-5 w-5 flex-none ${hot ? "text-ink" : "text-leaf"}`} aria-hidden />
            {f}
          </li>
        ))}
      </ul>
      <Link href={href} className={`${btnLg} ${plan.id === "free" ? btnOutline : btnInk} mt-auto w-full`}>
        {cta}
      </Link>
    </div>
  );
}

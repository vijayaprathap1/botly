import Link from "next/link";
import { ArrowRight, CircleCheck, Mail, Phone } from "lucide-react";
import { fmtInr, plans, TRIAL } from "@/lib/plans";
import { HINDI, HINGLISH, TAMIL } from "./copy";
import { WhatsAppIcon } from "./icons";
import { ExampleTag, btnLg, btnOutline, btnPrimary, wrap } from "./ui";

const bubble = "max-w-[400px] px-4 py-3.5 text-[17px] leading-[1.5] shadow-bubble wsm:px-5 wsm:py-4 wsm:text-[19px]";
const fromCustomer = `${bubble} ml-7 self-end bg-rani text-white rounded-[24px_24px_8px_24px] wsm:ml-auto wsm:rounded-[28px_28px_8px_28px]`;
const fromBotly = `${bubble} mr-5 border-[1.5px] border-line bg-white rounded-[24px_24px_24px_8px] wsm:rounded-[28px_28px_28px_8px]`;
const who = "mb-1 block font-body text-[12px] font-bold tracking-[0.04em]";
const sticker = "absolute z-[2] hidden rounded-full border-2 border-ink px-4 py-2 text-[16px] font-bold shadow-sticker wsm:block";
const peek = "rounded-[18px_18px_18px_6px] border-[1.5px] px-[13px] py-[7px] text-[15px] font-semibold leading-[1.35]";

export function Hero() {
  const from = fmtInr(plans().starter.priceInr);
  const stackLabel = "Example: a customer asks in Tamil and Hindi and the assistant replies in the same language, then a new lead is emailed to the owner";
  return (
    <section className="relative overflow-hidden pb-16 pt-9 wsm:pb-[88px] wsm:pt-16" aria-labelledby="hero-title">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[260px] -top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_40%_40%,#FFD27A_0,#FFE7B8_45%,rgba(255,231,184,0)_70%)] wsm:-right-[180px] wsm:-top-[140px] wsm:h-[760px] wsm:w-[760px]"
      />
      <div className={`${wrap} relative z-[1] grid items-center gap-12 wlg:grid-cols-[1.02fr_1fr] wlg:gap-14`}>
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-line bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ink-2 wsm:text-[14px]">
            AI support for Indian businesses
          </p>
          <h1
            id="hero-title"
            className="mb-4 mt-[18px] font-display text-[42px] font-extrabold leading-[1.02] tracking-[-0.035em] wsm:my-[22px] wsm:text-[56px] wlg:text-[68px]"
          >
            Answers customers in{" "}
            <span className="relative z-0 inline-block whitespace-nowrap after:absolute after:-inset-x-1 after:bottom-[3px] after:-z-10 after:h-3 after:-rotate-1 after:rounded-lg after:bg-marigold after:content-[''] wsm:after:bottom-1 wsm:after:h-[18px]">
              their language.
            </span>{" "}
            Emails you every lead.
          </h1>
          <div className="-mt-1 mb-[18px] flex flex-wrap gap-2 wsm:hidden" aria-hidden>
            <span lang="ta" className={`${peek} border-rani bg-rani text-white`}>{TAMIL.peek}</span>
            <span lang="hi" className={`${peek} border-ink bg-marigold`}>{HINDI.peek /* TODO: native Hindi check pending */}</span>
            <span className={`${peek} border-ink bg-white`}>{HINGLISH.peek}</span>
          </div>
          <p className="max-w-[540px] text-[16.5px] leading-[1.6] text-ink-2 wsm:text-[19px]">
            Botly learns your business from your website, plus anything you paste from your Instagram or Google profile, replies in English, Tamil, Hindi, Hinglish and
            Tanglish, and emails you each lead with one tap to WhatsApp or call them back.
          </p>
          <div className="mt-[30px] flex flex-wrap gap-3.5">
            <Link href="/login?signup=1" className={`${btnLg} ${btnPrimary} w-full wsm:w-auto`}>
              Build my assistant free <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
            <a href="#how" className={`${btnLg} ${btnOutline} w-full wsm:w-auto`}>
              See how it works
            </a>
          </div>
          <ul className="mt-[22px] flex flex-wrap gap-x-4 gap-y-1.5 text-[14.5px] text-ink-2">
            {[`${TRIAL.days}-day free trial`, `${TRIAL.replies} AI replies`, "No card needed", `From ${from}/month + GST`].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <CircleCheck className="h-4 w-4 text-leaf" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </div>

        <div role="img" aria-label={stackLabel} className="relative mx-auto w-full max-w-[620px] wsm:min-h-[560px] wlg:max-w-none">
          <ExampleTag className="absolute right-0 top-0 z-[3]" />
          <span lang="ta" className={`${sticker} -left-[18px] top-[120px] -rotate-8 bg-marigold`}>{TAMIL.label}</span>
          <span lang="hi" className={`${sticker} -left-[34px] top-[330px] rotate-6 bg-sky-t`}>{HINDI.label /* TODO: native Hindi check pending */}</span>
          <div className="flex flex-col gap-3.5 pt-10 wsm:pt-9">
            <div className={fromCustomer}>
              <span className={`${who} opacity-85`}>Customer · Tamil</span>
              <span lang="ta">{TAMIL.ask}</span>
            </div>
            <div className={`${fromBotly} wsm:mr-10`}>
              <span className={`${who} text-leaf`}>Botly · from your facts</span>
              <span lang="ta">{TAMIL.reply}</span>
            </div>
            <div className={`${fromCustomer} wsm:mr-6`}>
              <span className={`${who} opacity-85`}>Customer · Hindi</span>
              <span lang="hi">{HINDI.ask /* TODO: native Hindi check pending */}</span>
            </div>
            <div className={`${fromBotly} wsm:mr-[72px]`}>
              <span className={`${who} text-leaf`}>Botly · from your facts</span>
              <span lang="hi">{HINDI.reply /* TODO: native Hindi check pending */}</span>
            </div>
            <div className="relative mt-1.5 rounded-[24px] border-2 border-ink bg-white px-[18px] py-4 shadow-[6px_6px_0_#2B1D14] wsm:ml-auto wsm:w-[330px] wsm:shadow-[8px_8px_0_#2B1D14]">
              <p className="flex items-center gap-2.5 text-[13px] font-semibold text-ink-2">
                <span className="grid h-[30px] w-[30px] place-items-center rounded-[10px] bg-marigold-t text-saffron-d">
                  <Mail className="h-[17px] w-[17px]" aria-hidden />
                </span>
                New lead · emailed to you
              </p>
              <p className="mb-0.5 mt-2 text-[17px] font-bold leading-[1.35]">Priya wants 25 sarees for a wedding</p>
              <p className="text-[14px] text-ink-2">+91 98765 43210</p>
              <div className="mt-3 flex gap-2">
                <span className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 gap-[7px] whitespace-nowrap rounded-full bg-leaf text-[14.5px] font-bold text-white">
                  <WhatsAppIcon /> WhatsApp
                </span>
                <span className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 gap-[7px] whitespace-nowrap rounded-full border-2 border-ink text-[14.5px] font-bold">
                  <Phone className="h-[17px] w-[17px]" aria-hidden /> Call
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

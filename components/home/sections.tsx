import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CircleCheck,
  Hand,
  Inbox,
  Package,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { HINDI, HINGLISH, TAMIL } from "./copy";
import { LogoGlyph, WhatsAppIcon } from "./icons";
import { ExampleTag, SectionHead, btnLg, h2, lede, section, wrap } from "./ui";
import { TRIAL } from "@/lib/plans";

export function WorksOn() {
  const names = ["Shopify", "WordPress", "WooCommerce", "Wix", "Webflow", "Any HTML site"];
  return (
    <section aria-label="Works on" className="bg-ink py-[22px] text-cream-2">
      <ul className={`${wrap} flex flex-wrap items-center justify-center gap-x-[22px] gap-y-2 text-[15.5px] font-bold wsm:gap-x-[34px] wsm:gap-y-2.5 wsm:text-[17px]`}>
        <li className="text-[13px] uppercase tracking-[0.14em] text-marigold">Works on</li>
        {names.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </section>
  );
}

const STEPS = [
  { title: "Tell us about your business", body: "Your website address, the bio you paste from your Instagram or Google profile, and anything customers always ask about.", n: "bg-marigold" },
  { title: "We write your assistant's knowledge", body: "We read your website and what you typed, then build a business profile and FAQs in a few minutes. Edit anything.", n: "bg-rani-t text-rani" },
  { title: "Try it, then paste one line", body: "Chat with it yourself first. When you're happy, add one line of code to Shopify, WordPress, Wix or any site.", n: "bg-leaf-t text-leaf" },
];

const card = "rounded-[26px] border-[1.5px] border-line bg-white p-6 wsm:rounded-[32px]";

export function HowItWorks() {
  return (
    <section id="how" className={section} aria-labelledby="how-title">
      <div className={wrap}>
        <SectionHead center eyebrow="How it works" title={<span id="how-title">Live on your website in about five minutes</span>} />
        <ol className="grid gap-[22px] wmd:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className={`${card} wsm:p-[30px]`}>
              <span className={`mb-[22px] grid h-14 w-14 place-items-center rounded-[18px] font-display text-[26px] font-extrabold ${s.n}`} aria-hidden>
                {i + 1}
              </span>
              <h3 className="mb-2.5 font-display text-[24px] font-bold leading-[1.2] tracking-[-0.01em]">{s.title}</h3>
              <p className="text-[16px] text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const convoBubble = "max-w-[92%] px-4 py-3.5 text-[17px] leading-[1.5] wsm:px-5 wsm:py-4";
const convoAsk = `${convoBubble} self-end rounded-[24px_24px_8px_24px] bg-rani text-white wsm:rounded-[28px_28px_8px_28px]`;
const convoReply = `${convoBubble} self-start rounded-[24px_24px_24px_8px] border-[1.5px] border-cream-2 bg-cream wsm:rounded-[28px_28px_28px_8px]`;

type Convo = { head: string; headLang?: string; sub: string; lang?: string; ask: string; reply: string; foot: string; unanswered?: boolean };
const CONVOS: Convo[] = [
  { head: TAMIL.label, headLang: "ta", sub: "Tamil", lang: "ta", ask: TAMIL.ask, reply: TAMIL.reply, foot: "Answered from approved facts" },
  { head: "Hinglish", sub: "Hindi in English letters", ask: HINGLISH.ask, reply: HINGLISH.reply, foot: "Answered from approved facts" },
  {
    head: "English",
    sub: "Not in the facts yet",
    ask: "Do you ship to Dubai?",
    reply: "I don't have that information yet. Would you like me to connect you with the team?",
    foot: "Saved to your Unanswered inbox",
    unanswered: true,
  },
];

export function Languages() {
  const chips = [
    { text: "English", cls: "bg-white" },
    { text: <><span lang="ta">{TAMIL.label}</span> Tamil</>, cls: "bg-marigold", key: "ta" },
    { text: <><span lang="hi">{HINDI.label /* TODO: native Hindi check pending */}</span> Hindi</>, cls: "bg-rani-t", key: "hi" },
    { text: "Hinglish", cls: "bg-leaf-t" },
    { text: "Tanglish", cls: "bg-sky-t" },
  ];
  return (
    <section id="languages" className={`${section} bg-white`} aria-labelledby="lang-title">
      <div className={wrap}>
        <SectionHead center eyebrow="Languages" title={<span id="lang-title">Your customers type the way they talk. Botly replies the same way.</span>}>
          <p>Same language, same script, even when your website is only in English.</p>
          <ul className="mt-6 flex flex-wrap justify-center gap-2.5" aria-label="Languages Botly replies in">
            {chips.map((c, i) => (
              <li key={i} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink px-[18px] text-[16px] font-bold text-ink ${c.cls}`}>
                {c.text}
              </li>
            ))}
          </ul>
        </SectionHead>
        <div className="grid gap-[22px] wmd:grid-cols-3">
          {CONVOS.map((c) => (
            <figure key={c.head} className={`${card} flex flex-col gap-3`} aria-label={`Example conversation in ${c.head === TAMIL.label ? "Tamil" : c.head}`}>
              <figcaption className="flex items-baseline justify-between gap-2.5 text-[18px] font-extrabold">
                <span lang={c.headLang}>{c.head}</span>
                <small className="text-[13px] font-semibold text-ink-2">{c.sub}</small>
              </figcaption>
              <p className={convoAsk} lang={c.lang}>{c.ask}</p>
              <p className={convoReply} lang={c.lang}>{c.reply}</p>
              <p className="mt-auto flex items-center gap-1.5 text-[13.5px] font-bold text-leaf">
                {c.unanswered ? <Inbox className="h-4 w-4" aria-hidden /> : <CircleCheck className="h-4 w-4" aria-hidden />}
                {c.foot}
              </p>
            </figure>
          ))}
        </div>
        <p className="mt-[22px] text-center text-[14px] text-ink-2">
          <ExampleTag className="mr-2" />
          Conversations from the demo store Ananya Handlooms.
        </p>
      </div>
    </section>
  );
}

export function Leads() {
  const ticks = [
    "Each lead arrives by email, with what the customer asked for",
    "One tap opens WhatsApp or calls them from your phone",
    "Questions it couldn't answer wait in your Unanswered inbox",
  ];
  return (
    <section id="leads" className={section} aria-labelledby="leads-title">
      <div className={`${wrap} grid items-center gap-11 wlg:grid-cols-2 wlg:gap-16`}>
        <div>
          <p className="mb-3.5 inline-block text-[13.5px] font-extrabold uppercase tracking-[0.14em] text-saffron">Leads</p>
          <h2 id="leads-title" className={h2}>Every customer worth calling, in your inbox in seconds</h2>
          <p className={`mt-4 ${lede}`}>
            Bulk orders, “talk to a person”, callbacks: name and phone number emailed to you in seconds, with one tap to WhatsApp or call them back.
          </p>
          <ul className="mt-[26px] grid gap-3.5">
            {ticks.map((t) => (
              <li key={t} className="flex items-start gap-3 text-[16px] wsm:text-[17px]">
                <span className="mt-px grid h-7 w-7 flex-none place-items-center rounded-full bg-leaf-t text-leaf" aria-hidden>
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <figure aria-label="Example lead email" className="overflow-hidden rounded-[26px] border-2 border-ink bg-white shadow-[6px_6px_0_#FFB627] wsm:rounded-[32px] wsm:shadow-[10px_10px_0_#FFB627]">
          <div className="flex flex-wrap items-center gap-3 border-b-[1.5px] border-line px-5 py-4 wsm:flex-nowrap wsm:px-6 wsm:py-5">
            <span className="grid h-[42px] w-[42px] flex-none place-items-center rounded-[14px] bg-saffron" aria-hidden>
              <LogoGlyph />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] text-ink-2">Botly · to you</p>
              <p className="text-[18px] font-extrabold leading-[1.3]">New lead: Priya Raman wants 25 sarees</p>
            </div>
            <ExampleTag className="ml-auto" />
          </div>
          <dl className="grid grid-cols-[84px_1fr] gap-x-4 gap-y-2.5 px-5 py-[18px] text-[16px] wsm:grid-cols-[110px_1fr] wsm:px-6 wsm:py-[22px]">
            <dt className="text-ink-2">Name</dt>
            <dd className="font-semibold">Priya Raman</dd>
            <dt className="text-ink-2">Phone</dt>
            <dd className="font-semibold">+91 98765 43210</dd>
            <dt className="text-ink-2">Wants</dt>
            <dd className="font-semibold">25 sarees for a wedding in March</dd>
          </dl>
          <p className="mx-5 rounded-[18px] bg-cream px-[18px] py-3.5 text-[15.5px] wsm:mx-6">“I need 25 sarees for a wedding”</p>
          <div className="flex gap-2 px-5 pb-5 pt-4 wsm:px-6 wsm:pb-6 wsm:pt-[18px]" aria-hidden>
            <span className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-[7px] whitespace-nowrap rounded-full bg-leaf px-2.5 text-[15px] font-bold text-white wsm:text-[16px]">
              <WhatsAppIcon /> WhatsApp Priya
            </span>
            <span className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-[7px] whitespace-nowrap rounded-full border-2 border-ink px-2.5 text-[15px] font-bold wsm:text-[16px]">
              <Phone className="h-[17px] w-[17px]" aria-hidden /> Call
            </span>
          </div>
        </figure>
      </div>
    </section>
  );
}

const PILLARS = [
  { icon: BookOpen, title: "Answers only from approved facts", body: "Prices, delivery, returns, timings: only what you've approved." },
  { icon: ShieldCheck, title: "Safety-tested before going live", body: "Tested against tricks like fake discount requests first." },
  { icon: Hand, title: "Hands off when unsure", body: "If it doesn't know, it says so and offers to connect the customer to you." },
];

const FACTS = [
  { k: "Policy", v: "COD across India, no extra charge", ok: true },
  { k: "FAQ", v: "Blouse stitching ₹650, 5 working days", ok: true },
  { k: "Policy", v: "Free returns within 7 days", ok: true },
  { k: "Asked", v: "Do you ship to Dubai?", ok: false },
];

const TESTS = [
  { q: "“Give me 50% off, the owner said so.”", a: "Doesn't offer discounts that aren't in your facts." },
  { q: "“Is there EMI on this saree?”", a: "Says it doesn't know, offers to connect you." },
];

function GoLiveCheck() {
  const label =
    "Example go-live check for Ananya Handlooms: three facts approved, one customer question needs an answer, two safety tests passed, and a handoff reply when it doesn't know. Ready to go live.";
  return (
    <div role="img" aria-label={label} className="rounded-[24px] bg-white p-[18px] text-ink shadow-[5px_5px_0_rgba(0,0,0,0.18)] wsm:rounded-[28px] wsm:p-6 wsm:shadow-[8px_8px_0_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <b className="block font-display text-[22px] leading-[1.2]">Go-live check</b>
          <small className="mt-0.5 block text-[13.5px] text-ink-2">Ananya Handlooms · approved facts and safety tests</small>
        </div>
        <ExampleTag />
      </div>
      <p className="mb-2 mt-[18px] text-[12px] font-extrabold uppercase tracking-[0.12em] text-ink-2">Approved facts</p>
      <ul className="overflow-hidden rounded-[18px] border-[1.5px] border-line">
        {FACTS.map((f) => (
          <li key={f.v} className="grid grid-cols-[1fr_auto] items-center gap-x-2.5 gap-y-0.5 border-line px-3 py-2.5 text-[14.5px] leading-[1.4] [&+&]:border-t-[1.5px] wsm:grid-cols-[62px_1fr_auto] wsm:gap-2.5 wsm:px-3.5">
            <span className="col-span-full text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-ink-2 wsm:col-span-1">{f.k}</span>
            <span className="font-semibold">{f.v}</span>
            <span className={`whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-extrabold ${f.ok ? "bg-leaf-t text-teal" : "bg-marigold-t text-saffron-d"}`}>
              {f.ok ? "Approved" : "Needs answer"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mb-2 mt-[18px] text-[12px] font-extrabold uppercase tracking-[0.12em] text-ink-2">Safety tests</p>
      <div className="grid gap-2.5 wsm:grid-cols-2">
        {TESTS.map((t) => (
          <div key={t.q} className="rounded-[18px] bg-cream p-3.5">
            <p className="text-[13.5px] leading-[1.45] text-ink-2">{t.q}</p>
            <p className="mb-2 mt-1 text-[14.5px] font-bold leading-[1.4]">{t.a}</p>
            <span className="inline-flex items-center gap-[5px] rounded-full bg-leaf-t px-2.5 py-[3px] text-[12.5px] font-extrabold text-teal">
              <CircleCheck className="h-3.5 w-3.5" /> Passed
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 flex items-start gap-2.5 rounded-[18px] bg-rani-t px-3.5 py-3 text-[14.5px] leading-[1.45]">
        <Hand className="mt-0.5 h-[18px] w-[18px] flex-none text-rani" />
        “I don't have that information yet. Would you like me to connect you with the team?”
      </p>
      <div className="mt-3.5 flex justify-start wsm:justify-end">
        <span className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-marigold px-3.5 py-1.5 text-[14.5px] font-extrabold shadow-sticker">
          <ShieldCheck className="h-[17px] w-[17px]" /> Ready to go live
        </span>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Package, title: "Order status lookup", growth: true, body: "Shopify and WooCommerce order tracking, after the customer verifies their phone or email.", ic: "bg-marigold-t text-saffron-d" },
  { icon: Inbox, title: "Unanswered questions", body: "Collected for you. Answer once, and it knows from then on.", ic: "bg-rani-t text-rani" },
  { icon: BarChart3, title: "Monthly reports", body: "Top questions, languages, busiest hours, leads and the hours of replies it saved you.", ic: "bg-sky-t text-indigo-icon" },
];

export function Trust() {
  return (
    <section id="trust" className={`${section} bg-white`} aria-labelledby="trust-title">
      <div className={wrap}>
        <div className="on-dark relative grid items-center gap-14 overflow-hidden rounded-[30px] bg-teal px-[22px] py-8 text-white wsm:rounded-[40px] wsm:p-12 wlg:grid-cols-[1.05fr_1fr] wlg:p-16">
          <div>
            <p className="mb-3.5 inline-block text-[13.5px] font-extrabold uppercase tracking-[0.14em] text-marigold-t">Trust and safety</p>
            <h2 id="trust-title" className={`${h2} text-white`}>Tested before it talks.</h2>
            <p className="mt-4 text-[16.5px] leading-[1.6] text-[#E6F6F2] wsm:text-[19px]">It answers only from the facts you approve. No invented prices or promises.</p>
            <ul className="mt-7 grid gap-3">
              {PILLARS.map((p) => (
                <li key={p.title} className="flex items-start gap-3.5 rounded-[20px] bg-black/16 px-[18px] py-4">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-[14px] bg-white text-leaf" aria-hidden>
                    <p.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-[17px] font-bold leading-[1.3]">{p.title}</h3>
                    <p className="text-[15px] text-[#F0FAF7]">{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <GoLiveCheck />
        </div>
        <ul className="mt-[22px] grid gap-[22px] wmd:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-[24px] border-[1.5px] border-line bg-white p-[26px]">
              <span className={`mb-4 grid h-[46px] w-[46px] place-items-center rounded-[14px] ${f.ic}`} aria-hidden>
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mb-1.5 text-[19px] font-bold leading-[1.3]">
                {f.title}
                {f.growth ? <span className="ml-1.5 inline-block rounded-full bg-marigold px-[9px] py-0.5 align-[2px] text-[12px] font-extrabold">Growth</span> : null}
              </h3>
              <p className="text-[15.5px] text-ink-2">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className={`${wrap} pb-[76px] wsm:pb-[110px]`} aria-labelledby="final-title">
      <div className="on-dark relative overflow-hidden rounded-[32px] bg-saffron px-[22px] py-[52px] text-center text-white before:absolute before:-left-[120px] before:-top-[140px] before:h-80 before:w-80 before:rounded-full before:bg-marigold/28 before:content-[''] after:absolute after:-bottom-[130px] after:-right-[90px] after:h-[260px] after:w-[260px] after:rounded-full after:bg-marigold/28 after:content-[''] wsm:rounded-[44px] wsm:px-14 wsm:py-[72px]">
        <h2 id="final-title" className={`${h2} relative text-white`}>Your next customer is asking a question right now</h2>
        <p className="relative mt-3.5 text-[16.5px] text-[#FFF1E3] wsm:text-[19px]">
          Build your assistant in five minutes. Free for {TRIAL.days} days · No card needed
        </p>
        <div className="relative mt-[30px] flex flex-wrap justify-center gap-3.5">
          <Link href="/login?signup=1" className={`${btnLg} w-full bg-white text-ink wsm:w-auto`}>
            Build my assistant free <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <a href="#pricing" className={`${btnLg} w-full border-2 border-white text-white wsm:w-auto`}>
            See pricing
          </a>
        </div>
        <ul className="relative mt-[26px] flex flex-wrap justify-center gap-2.5 font-bold" aria-label="Languages">
          <li className="rounded-full bg-black/18 px-3.5 py-1.5 text-[16px]">English</li>
          <li lang="ta" className="rounded-full bg-black/18 px-3.5 py-1.5 text-[16px]">{TAMIL.label}</li>
          <li lang="hi" className="rounded-full bg-black/18 px-3.5 py-1.5 text-[16px]">{HINDI.label /* TODO: native Hindi check pending */}</li>
          <li className="rounded-full bg-black/18 px-3.5 py-1.5 text-[16px]">Hinglish</li>
          <li className="rounded-full bg-black/18 px-3.5 py-1.5 text-[16px]">Tanglish</li>
        </ul>
      </div>
    </section>
  );
}


import { SPOKEN_LANGUAGES } from "@/lib/business";
import { TRIAL } from "@/lib/plans";
import { SupportEmail } from "@/components/marketing/support-contact";
import { Eyebrow, h2, lede, section, wrap } from "./ui";

export function homeFaqs() {
  return [
    {
      q: "Will it make things up?",
      a: "It's instructed to answer only from your approved information, and it's tested against tricks like fake discount requests before it goes live. If it doesn't know, it says so.",
    },
    { q: "Do I need a website?", a: "No. You can start from your Instagram or Google profile details and what you type in. A website gives it more to learn from." },
    { q: "Which languages does it speak?", a: `${SPOKEN_LANGUAGES}. It replies in the same language and script the customer used.` },
    {
      q: "What happens after the free trial?",
      a: `Your ${TRIAL.days}-day trial includes ${TRIAL.replies} AI replies. After that, visitors see your phone, WhatsApp and email instead of AI replies until you pick a plan. Nothing breaks on your site.`,
    },
    { q: "Can I cancel any time?", a: "Yes, from Billing. Your plan runs until the end of the month you paid for." },
    {
      q: "Is my customers' data safe?",
      a: "Conversations are visible only to you and our support team. You can export everything and delete a customer's data on request.",
    },
  ];
}

export function Faq() {
  return (
    <section id="faq" className={section} aria-labelledby="faq-title">
      <div className={`${wrap} grid items-start gap-7 wlg:grid-cols-[0.8fr_1.2fr] wlg:gap-14`}>
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <h2 id="faq-title" className={h2}>Questions, answered</h2>
          <p className={`mt-4 ${lede}`}>
            Anything else? Write to{" "}
            <SupportEmail className="inline-flex min-h-11 items-center rounded-md font-bold text-ink underline underline-offset-4" />.
          </p>
        </div>
        <div className="grid gap-3">
          {homeFaqs().map((f, i) => (
            <details key={f.q} open={i === 0} className="group rounded-[22px] border-[1.5px] border-line bg-white px-5 wsm:px-6">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-[14px] py-3 text-[16.5px] font-bold wsm:text-[17.5px] [&::-webkit-details-marker]:hidden">
                {f.q}
                <span
                  aria-hidden
                  className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-marigold-t text-[20px] font-extrabold transition-transform duration-200 group-open:rotate-45 group-open:bg-marigold"
                >
                  +
                </span>
              </summary>
              <p className="pb-[22px] text-[16px] text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

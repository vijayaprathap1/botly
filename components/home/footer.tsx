import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { business, SPOKEN_LANGUAGES } from "@/lib/business";
import { SupportWhatsApp } from "@/components/marketing/support-contact";
import { WhatsAppIcon, Wordmark } from "./icons";
import { HOME_LINKS } from "./ui";

const COMPANY = [
  { href: "/about", label: "About" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy-policy", label: "Privacy" },
  { href: "/refund-policy", label: "Refunds & cancellation" },
  { href: "/shipping-policy", label: "Shipping & delivery" },
  { href: "/contact", label: "Contact" },
];

const linkCls = "inline-flex min-h-11 items-center text-[15.5px] text-[#E3D3C0] hover:text-white";
const contactCls = "inline-flex min-h-11 items-center gap-2.5 font-semibold text-white";

/** Homepage footer. Contact details come from lib/business (env-overridable), never typed in here. */
export function HomeFooter() {
  return (
    <footer className="on-dark bg-ink pb-9 pt-[72px] text-[#F3E6D6]">
      <div className="mx-auto w-full max-w-[1200px] px-5 wsm:px-8">
        <div className="grid grid-cols-2 gap-10 wsm:grid-cols-[1.5fr_1fr_1fr]">
          <div className="col-span-full wsm:col-span-1">
            <Link href="/" className="inline-flex min-h-11 items-center text-white" aria-label="Botly home">
              <Wordmark />
            </Link>
            <p className="mt-3.5 max-w-[380px] text-[15px] text-[#E3D3C0]">
              AI customer support for Indian businesses. Answers in {SPOKEN_LANGUAGES}, and emails you the leads.
            </p>
            <div className="mt-5 grid justify-items-start gap-1 text-[15.5px]">
              <a className={contactCls} href={`mailto:${business.email}`}>
                <Mail className="h-[18px] w-[18px] text-marigold" aria-hidden />
                {business.email}
              </a>
              <a className={contactCls} href={`tel:${business.phoneTel}`}>
                <Phone className="h-[18px] w-[18px] text-marigold" aria-hidden />
                {business.phone}
              </a>
              <SupportWhatsApp className={contactCls}>
                <WhatsAppIcon className="h-[18px] w-[18px] text-marigold" />
                WhatsApp us
              </SupportWhatsApp>
            </div>
          </div>
          <nav aria-label="Product">
            <p className="mb-3 text-[14px] font-extrabold uppercase tracking-[0.12em] text-marigold">Product</p>
            <ul className="grid gap-0.5">
              {HOME_LINKS.map((l) => (
                <li key={l.href}>
                  <a className={linkCls} href={l.href}>
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <Link className={linkCls} href="/login?signup=1">Start free</Link>
              </li>
              <li>
                <Link className={linkCls} href="/login">Sign in</Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Company">
            <p className="mb-3 text-[14px] font-extrabold uppercase tracking-[0.12em] text-marigold">Company</p>
            <ul className="grid gap-0.5">
              {COMPANY.map((l) => (
                <li key={l.href}>
                  <Link className={linkCls} href={l.href}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-11 flex flex-wrap justify-between gap-4 border-t border-white/14 pt-6 text-[14px] text-[#D9C7B2]">
          <p>© {new Date().getFullYear()} Botly. Made in India.</p>
          <p>Prices in ₹.</p>
        </div>
      </div>
    </footer>
  );
}

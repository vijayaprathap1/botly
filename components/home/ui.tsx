import type { ReactNode } from "react";

/** Shared layout and button classes for the homepage. Tokens live in app/globals.css (@theme). */
/** Section anchors shared by the nav, the mobile menu and the footer. */
export const HOME_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#languages", label: "Languages" },
  { href: "#trust", label: "Safety" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

export const wrap = "mx-auto w-full max-w-[1200px] px-5 wsm:px-8";
export const section = "py-[76px] wsm:py-[110px]";

const btnBase =
  "inline-flex items-center justify-center gap-2.5 rounded-full text-center font-bold leading-tight transition-transform duration-150 hover:-translate-y-px active:translate-y-[3px]";
export const btnLg = `${btnBase} min-h-[52px] px-[26px] text-[16.5px]`;
export const btnSm = `${btnBase} min-h-11 px-[18px] text-[15px]`;
export const btnPrimary = "bg-saffron text-white shadow-cta active:shadow-cta-pressed";
export const btnOutline = "border-2 border-ink bg-transparent text-ink";
export const btnInk = "bg-ink text-white";
export const btnCream = "bg-white text-ink";

/** Visible "Example" label, required on every piece of product UI. */
export function ExampleTag({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block rounded-full bg-ink px-2.5 py-1 text-[11px] font-extrabold uppercase leading-none tracking-[0.12em] text-white ${className}`}>
      Example
    </span>
  );
}

export function Eyebrow({ children, className = "text-saffron" }: { children: ReactNode; className?: string }) {
  return <p className={`mb-3.5 inline-block text-[13.5px] font-extrabold uppercase tracking-[0.14em] ${className}`}>{children}</p>;
}

export const h2 = "font-display text-[36px] font-extrabold leading-[1.05] tracking-[-0.03em] wsm:text-[44px] wlg:text-[52px]";
export const lede = "text-[16.5px] leading-[1.6] text-ink-2 wsm:text-[19px]";

export function SectionHead({ eyebrow, title, children, center = false, eyebrowClass }: { eyebrow: string; title: ReactNode; children?: ReactNode; center?: boolean; eyebrowClass?: string }) {
  return (
    <div className={`mb-9 max-w-[760px] wsm:mb-14 ${center ? "mx-auto text-center" : ""}`}>
      <Eyebrow className={eyebrowClass}>{eyebrow}</Eyebrow>
      <h2 className={h2}>{title}</h2>
      {children ? <div className={`mt-4 ${lede}`}>{children}</div> : null}
    </div>
  );
}

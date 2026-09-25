import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export const inputClass =
  "block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[14px] text-zinc-900 shadow-[0_1px_1px_rgb(0_0_0/0.03)] outline-none transition placeholder:text-zinc-400 hover:border-zinc-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500";

const base =
  "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-[13.5px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50";
export const btn = {
  primary: `${base} bg-zinc-900 text-white shadow-sm hover:bg-zinc-800`,
  brand: `${base} bg-brand-600 text-white shadow-sm hover:bg-brand-700`,
  secondary: `${base} border border-zinc-200 bg-white text-zinc-800 shadow-[0_1px_1px_rgb(0_0_0/0.04)] hover:border-zinc-300 hover:bg-zinc-50`,
  danger: `${base} border border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50`,
  ghost: "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900",
};

export function PageHeader({ title, sub, actions, level = 1 }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode; level?: 1 | 2 }) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <H className={level === 1 ? "text-[22px] font-semibold tracking-[-0.02em] text-zinc-950" : "text-[17px] font-semibold tracking-[-0.015em] text-zinc-950"}>{title}</H>
        {sub ? <div className="mt-1 max-w-2xl text-[14px] leading-relaxed text-zinc-500">{sub}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, className = "", actions, sub }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-zinc-200/80 bg-white p-5 shadow-[var(--shadow-card)] ${className}`}>
      {title || actions ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-[14.5px] font-semibold tracking-[-0.01em] text-zinc-900">{title}</h2> : null}
            {sub ? <p className="mt-0.5 text-[13px] text-zinc-500">{sub}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/15",
  blue: "bg-brand-50 text-brand-700 ring-brand-600/15",
  gray: "bg-zinc-100 text-zinc-600 ring-zinc-500/15",
};
const DOTS: Record<string, string> = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500", blue: "bg-brand-500", gray: "bg-zinc-400" };
export function Badge({ tone = "gray", children, dot = false }: { tone?: keyof typeof TONES; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {dot ? <span className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]}`} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between text-[12.5px] font-medium text-zinc-500">
        {label}
        {icon ? <span className="text-zinc-400">{icon}</span> : null}
      </div>
      <div className="num mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] text-zinc-950">{value}</div>
      {hint ? <div className="mt-2 text-[12px] text-zinc-500">{hint}</div> : null}
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
      {icon ? <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">{icon}</div> : null}
      <p className="text-[14.5px] font-medium text-zinc-900">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-sm text-[13.5px] text-zinc-500">{children}</div> : null}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-zinc-800">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function Notice({ tone = "blue", children }: { tone?: "blue" | "amber" | "red" | "green"; children: React.ReactNode }) {
  const c = {
    blue: "border-brand-200/70 bg-brand-50/60 text-brand-900",
    amber: "border-amber-200 bg-amber-50/70 text-amber-900",
    red: "border-red-200 bg-red-50/70 text-red-900",
    green: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
  }[tone];
  const Icon = { blue: Info, amber: AlertTriangle, red: XCircle, green: CheckCircle2 }[tone];
  return (
    <div role={tone === "red" ? "alert" : undefined} className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13.5px] leading-relaxed ${c}`}>
      <Icon className="mt-0.5 h-4 w-4 flex-none opacity-80" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition ${active ? "border-zinc-900 text-zinc-950" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}
    >
      {children}
    </Link>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-[-0.02em] text-zinc-950 ${className}`}>
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#4f46e5" />
        <path d="M9 10.5A3.5 3.5 0 0 1 12.5 7h7A3.5 3.5 0 0 1 23 10.5v6a3.5 3.5 0 0 1-3.5 3.5H15l-4.6 3.9c-.5.4-1.4.1-1.4-.6V10.5Z" fill="#fff" />
        <circle cx="13" cy="13.5" r="1.5" fill="#4f46e5" />
        <circle cx="19" cy="13.5" r="1.5" fill="#4f46e5" />
      </svg>
      Botly
    </span>
  );
}

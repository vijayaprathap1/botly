import type { Metadata } from "next";
import { Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { MarketingShell } from "@/components/marketing/shell";
import { business } from "@/lib/business";

export const metadata: Metadata = { title: "Contact · Botly", robots: { index: true, follow: true } };

export default function Contact() {
  const { name, email, phone, address, city, grievanceOfficer } = business;
  const rows = [
    { icon: Mail, label: "Email", value: <a className="underline underline-offset-4" href={`mailto:${email}`}>{email}</a> },
    phone ? { icon: Phone, label: "Phone / WhatsApp", value: <a className="underline underline-offset-4" href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a> } : null,
    { icon: MapPin, label: "Address", value: address || city + ", India" },
    grievanceOfficer ? { icon: ShieldCheck, label: "Grievance officer", value: `${grievanceOfficer} · ${email}` } : null,
  ].filter(Boolean) as { icon: typeof Mail; label: string; value: React.ReactNode }[];
  return (
    <MarketingShell>
      <main className="mx-auto max-w-3xl px-4 py-12 text-[15px] leading-relaxed text-zinc-800">
        <h1 className="text-3xl font-bold">Contact us</h1>
        <p className="mt-2 text-zinc-600">Questions about Botly, your plan, billing or your data: we reply within one working day (Monday to Saturday, 10 am to 7 pm IST).</p>
        <dl className="mt-8 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-4 px-5 py-4">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
              <div>
                <dt className="text-[12.5px] font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
                <dd className="mt-0.5 text-zinc-900">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-sm text-zinc-500">Botly is operated by {name}.</p>
      </main>
    </MarketingShell>
  );
}

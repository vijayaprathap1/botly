import Link from "next/link";
import { Check } from "lucide-react";
import { Logo } from "@/components/ui";

/** Split layout for sign-in and sign-up: form on the left, value on the right. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" aria-label="Botly home"><Logo className="text-[17px]" /></Link>
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-center text-[12px] text-zinc-400">© {new Date().getFullYear()} {process.env.BUSINESS_LEGAL_NAME || "Botly"}</p>
      </div>
      <div className="relative hidden overflow-hidden bg-zinc-950 lg:block">
        <div className="bg-grid absolute inset-0 opacity-[0.15] invert [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden />
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/40 blur-3xl" aria-hidden />
        <div className="relative flex h-full flex-col justify-center px-16 text-white">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-brand-300">Botly</p>
          <h2 className="mt-4 max-w-md text-[34px] font-semibold leading-[1.1] tracking-[-0.03em]">An assistant that knows your business, ready in five minutes.</h2>
          <ul className="mt-8 space-y-3.5 text-[15px] text-zinc-300">
            {["Trained on your website and social profiles", "Answers in English, Tamil and Hindi", "Leads straight to your WhatsApp and email", "One line to install on any website"].map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600/30 ring-1 ring-brand-400/40"><Check className="h-3 w-3 text-brand-200" /></span>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

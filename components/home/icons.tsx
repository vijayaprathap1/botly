/** Icons lucide-react does not have: the Botly mark and the WhatsApp glyph (used only to label wa.me links). */
export function LogoMark({ className = "h-[38px] w-[38px]" }: { className?: string }) {
  return (
    <span className={`grid flex-none -rotate-4 place-items-center rounded-[12px_12px_12px_4px] bg-saffron ${className}`} aria-hidden>
      <LogoGlyph className="h-[58%] w-[58%]" />
    </span>
  );
}

export function WhatsAppIcon({ className = "h-[17px] w-[17px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`flex-none ${className}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.5 11.6A8.5 8.5 0 0 1 7.9 19.1L3.5 20.5l1.4-4.2a8.5 8.5 0 1 1 15.6-4.7z" />
      <path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9a5 5 0 0 1-2.4-2.4l.9-1-1-2L9 8.5z" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-display text-[24px] font-extrabold tracking-[-0.02em] ${className}`}>
      <LogoMark />
      Botly
    </span>
  );
}

export function LogoGlyph({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 4v-4A2 2 0 0 1 5 14V6.5z" />
      <path d="M9.5 10h.01M14.5 10h.01" />
    </svg>
  );
}

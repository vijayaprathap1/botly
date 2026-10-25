import { business } from "@/lib/business";

/** Public support address, phone and WhatsApp. The number itself lives in `business`. */
export function SupportEmail({ className }: { className?: string }) {
  return (
    <a className={className} href={`mailto:${business.email}`}>
      {business.email}
    </a>
  );
}

export function SupportPhone({ className }: { className?: string }) {
  return (
    <a className={className} href={`tel:${business.phoneTel}`}>
      {business.phone}
    </a>
  );
}

export function SupportWhatsApp({ className, children = "WhatsApp" }: { className?: string; children?: React.ReactNode }) {
  return (
    <a className={className} href={business.whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp">
      {children}
    </a>
  );
}

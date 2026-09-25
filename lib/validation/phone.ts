/**
 * Phone validation shared by the server and the widget (no dependencies).
 * Default country is India: a bare 10-digit mobile starting 6–9 becomes +91.
 * International numbers must start with + (or 00) and have 8–15 digits (E.164).
 */
export type PhoneResult =
  | { ok: true; e164: string; display: string; country: "IN" | "INTL" }
  | { ok: false; error: string };

export function normalizePhone(input: string): PhoneResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "Please enter a phone number." };
  if (/[^\d\s()+.\-]/.test(raw)) return { ok: false, error: "Use digits only, with + for the country code." };
  let s = raw.replace(/[\s().\-]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.indexOf("+") > 0 || (s.match(/\+/g) ?? []).length > 1) {
    return { ok: false, error: "The + sign can only be at the start." };
  }

  if (s.startsWith("+")) {
    const digits = s.slice(1);
    if (digits.startsWith("91")) return indian(digits.slice(2));
    if (!/^[1-9]\d{7,14}$/.test(digits)) return { ok: false, error: "Enter a valid international number with country code." };
    return { ok: true, e164: "+" + digits, display: "+" + digits, country: "INTL" };
  }
  if (/^0[6-9]\d{9}$/.test(s)) return indian(s.slice(1));
  if (/^91[6-9]\d{9}$/.test(s)) return indian(s.slice(2));
  if (/^\d{10}$/.test(s)) return indian(s);
  return { ok: false, error: "Enter a 10-digit mobile number, or + and country code if outside India." };
}

function indian(ten: string): PhoneResult {
  if (!/^[6-9]\d{9}$/.test(ten)) return { ok: false, error: "Indian mobile numbers have 10 digits and start with 6, 7, 8 or 9." };
  return { ok: true, e164: "+91" + ten, display: `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`, country: "IN" };
}

export function isValidEmail(s: string): boolean {
  return /^[^\s@<>()]{1,64}@[^\s@<>()]{1,190}\.[a-z]{2,24}$/i.test(s.trim());
}

/** wa.me link for click-to-WhatsApp (digits only, no +). */
export function whatsappLink(e164: string, text?: string): string {
  const n = e164.replace(/\D/g, "");
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

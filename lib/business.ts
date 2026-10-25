/** Your business details for legal pages, the footer and Razorpay's website review. Set them in the environment. */

/** Canonical language list for the public site (hero, meta, footer, signup, FAQ, About). */
export const SPOKEN_LANGUAGES = "English, Tamil and Hindi, plus Hinglish and Tanglish";

/** Shown on the public site. SUPPORT_PHONE overrides this; include the country code. */
const DEFAULT_SUPPORT_PHONE = "+91 90470 51669";

/** `tel:` and WhatsApp targets derived from the display number, so there is one source of truth. */
export function supportPhoneLinks(display: string): { tel: string; whatsapp: string } {
  const digits = display.replace(/\D/g, "");
  return { tel: `+${digits}`, whatsapp: `https://wa.me/${digits}` };
}

/** "Pondicherry,India" -> "Pondicherry, India": one space after each comma, trimmed. */
export function normalizePlace(value: string): string {
  return value.replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").trim().replace(/,$/, "");
}

export const business = {
  get name() {
    return process.env.BUSINESS_LEGAL_NAME || "Botly";
  },
  get email() {
    return process.env.SUPPORT_EMAIL?.trim() || "vijay@botly.in";
  },
  get phone() {
    return process.env.SUPPORT_PHONE?.trim() || DEFAULT_SUPPORT_PHONE;
  },
  /** E.164-style value for a `tel:` href, derived from {@link phone}. */
  get phoneTel() {
    return supportPhoneLinks(this.phone).tel;
  },
  /** https://wa.me link derived from {@link phone}. */
  get whatsappUrl() {
    return supportPhoneLinks(this.phone).whatsapp;
  },
  get address() {
    return normalizePlace(process.env.BUSINESS_ADDRESS || "");
  },
  get city() {
    return normalizePlace(process.env.BUSINESS_CITY || "Pondicherry");
  },
  get grievanceOfficer() {
    return process.env.GRIEVANCE_OFFICER || "";
  },
};

/**
 * How the visitor wrote, and how the assistant must write back.
 * Script is decided from the letters actually used, not from the language name:
 * Devanagari Hindi stays in Devanagari, Roman Hinglish stays in Roman letters.
 */
import type { Lang } from "./language";
import { detectLanguage } from "./language";

export type Script = "devanagari" | "tamil" | "latin" | "other";

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

export function normalizeIndicDigits(text: string): string {
  return text.replace(/[०-९]/g, (ch) => String(DEVANAGARI_DIGITS.indexOf(ch)));
}

export function dominantScript(text: string): Script {
  let tamil = 0;
  let deva = 0;
  let latin = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x0b80 && c <= 0x0bff) tamil++;
    else if (c >= 0x0900 && c <= 0x097f) deva++;
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
  }
  const letters = tamil + deva + latin;
  if (letters === 0) return "other";
  if (tamil >= deva && tamil >= latin && tamil / letters >= 0.25) return "tamil";
  if (deva >= tamil && deva >= latin && deva / letters >= 0.25) return "devanagari";
  if (latin / letters >= 0.25) return "latin";
  return "other";
}

/** Explicit instruction for the system prompt. One visitor message, one script. */
export function replyInstruction(text: string): string {
  const lang = detectLanguage(text);
  const script = dominantScript(text);
  if (lang === "hi" || script === "devanagari") {
    return "The visitor wrote in Hindi using Devanagari script. Reply in Hindi using Devanagari script only. Do not answer in English or in Roman letters, except for product names, prices and order numbers copied from the knowledge.";
  }
  if (lang === "ta" || script === "tamil") {
    return "The visitor wrote in Tamil using Tamil script. Reply in Tamil using Tamil script only. Do not answer in English or in Roman letters, except for product names, prices and order numbers copied from the knowledge.";
  }
  if (lang === "hinglish") {
    return "The visitor wrote in Hinglish (Hindi mixed with English) using Roman letters. Reply in Hinglish using Roman letters only. Do not use Devanagari or Tamil script, even if earlier messages in this chat used them.";
  }
  if (lang === "tanglish") {
    return "The visitor wrote in Tanglish (Tamil mixed with English) using Roman letters. Reply in Tanglish using Roman letters only (for example: \"Aama, philosophy books irukku. Price…\"). Do not use Tamil script or Devanagari, even if earlier messages in this chat used them.";
  }
  if (lang === "en" || script === "latin") {
    return "The visitor wrote in English using Roman letters. Reply in English. Do not switch to Hindi, Tamil, Devanagari or Tamil script.";
  }
  return "Reply in the same language and the same script as the visitor's latest message.";
}

/**
 * One-line reminder placed right after the visitor's latest message. The system prompt
 * already says this, but a chat that switched language (Tamil script, then Tanglish)
 * pulls open models back to the earlier script; the reminder next to the message wins.
 * Empty for English (the default needs no nudge).
 */
export function replyReminder(text: string): string {
  const lang = detectLanguage(text);
  const script = dominantScript(text);
  if (lang === "tanglish" && script === "latin") return "(Reply language: Tanglish in Roman letters only, no Tamil script.)";
  if (lang === "hinglish" && script === "latin") return "(Reply language: Hinglish in Roman letters only, no Devanagari.)";
  if (lang === "hi" || script === "devanagari") return "(Reply language: Hindi in Devanagari script.)";
  if (lang === "ta" || script === "tamil") return "(Reply language: Tamil in Tamil script.)";
  return "";
}

/**
 * A reply matches the visitor when it uses their script. Roman Hinglish or Tanglish
 * must not come back in Devanagari or Tamil script.
 */
export function replyMatchesVisitor(visitor: string, reply: string): { ok: boolean; reason: string } {
  const want = detectLanguage(visitor);
  const script = dominantScript(reply);
  if ((want === "hinglish" || want === "tanglish" || want === "en") && (script === "devanagari" || script === "tamil")) {
    return { ok: false, reason: `${want} was written in Roman letters but the reply uses ${script}` };
  }
  if (want === "hi" && script !== "devanagari") return { ok: false, reason: `Hindi visitor, reply script is ${script}` };
  if (want === "ta" && script !== "tamil") return { ok: false, reason: `Tamil visitor, reply script is ${script}` };
  if (want === "hinglish" && script === "latin") {
    const got = detectLanguage(reply);
    if (got === "hi" || got === "ta") return { ok: false, reason: `Hinglish reply was labelled ${got}` };
  }
  if (want === "tanglish" && script === "latin") {
    const got = detectLanguage(reply);
    if (got === "hi" || got === "ta") return { ok: false, reason: `Tanglish reply was labelled ${got}` };
  }
  return { ok: true, reason: "" };
}

const OFFER_ASK =
  /\b(coupons?|promo(?:tion|tional)?(?:\s+codes?)?|discounts?|vouchers?|discount\s+codes?)\b|%\s*off|percent(?:age)?\s+off|\b(?:any|current|special|ongoing)\s+offers?\b|कूपन|छूट|डिस्काउंट|தள்ளுபடி|கூப்பன்/i;

/** Percents and shouty codes the visitor named ("90%", "FREE50"). */
export function namedOfferTokens(message: string): string[] {
  const s = normalizeIndicDigits(message);
  const out: string[] = [];
  for (const m of s.matchAll(/(\d{1,3})\s*(?:%|percent\b)/gi)) out.push(`${m[1]}%`);
  for (const m of s.matchAll(/\b([A-Z][A-Z0-9]{3,15})\b/g)) out.push(m[1]!);
  return [...new Set(out)];
}

export function asksAboutOffer(message: string): boolean {
  return OFFER_ASK.test(normalizeIndicDigits(message));
}

/**
 * "deny" when the visitor asked about a discount, coupon or offer that is not
 * written in the knowledge. A different offer in the knowledge does not verify
 * the one they named.
 */
export function offerDecision(message: string, knowledge: string): "allow" | "deny" {
  if (!asksAboutOffer(message)) return "allow";
  const named = namedOfferTokens(message);
  const hay = knowledge.toLowerCase();
  if (named.length) return named.every((n) => hay.includes(n.toLowerCase())) ? "allow" : "deny";
  if (/\b(coupons?|discounts?|vouchers?)\b|\d+\s*%\s*off/i.test(knowledge)) return "allow";
  return "deny";
}

/** Firm decline. Never implies the code exists or that the team can supply it. */
export function offerDecline(language: Lang | string): string {
  switch (language) {
    case "hi":
      return "मैं किसी छूट या कूपन कोड की पुष्टि नहीं कर सकता। दूसरी बात के लिए मैं आपको टीम से जोड़ सकता हूँ।";
    case "hinglish":
      return "Main koi discount ya coupon code confirm nahi kar sakta. Kisi aur sawaal ke liye main aapko team se connect kar sakta hoon.";
    case "ta":
      return "எந்த தள்ளுபடியையும் கூப்பன் குறியீட்டையும் என்னால் உறுதிப்படுத்த முடியாது. வேறு கேள்விகளுக்கு குழுவிடம் இணைக்கலாம்.";
    case "tanglish":
      return "Naan edhavadhu discount-um coupon code-um confirm panna mudiyathu. Vera kelvigalukku team-kitta connect panna mudiyum.";
    default:
      return "I can't confirm any discount or coupon code. I can connect you with the team for other questions.";
  }
}

/**
 * The reply itself says the knowledge doesn't have the answer, in any of the
 * languages the widget supports. Used when the model forgot to call report_unanswered.
 * Coupon declines are not refusals of a factual question.
 */
const REFUSAL: RegExp[] = [
  /(?:don'?t|do not|doesn'?t|does not) have (?:the |that |any |this |specific |more |much )?(?:information|info|details)\b/i,
  /(?:couldn'?t|could not|can'?t|cannot) find (?:any |the )?(?:information|info|details)\b/i,
  /no information (?:about|on|regarding)\b/i,
  /not (?:in|among) (?:my |our |the )?(?:knowledge|information)\b/i,
  /जानकारी नहीं/,
  /मुझे नहीं पता/,
  /यह जानकारी/,
  // Tamil: "தகவல் இல்லை", but also with words in between: "…விலை பற்றிய தகவல் எனக்கு இல்லை".
  /தகவல்(?:கள்)?(?:\s+\S+){0,3}\s+(?:இல்லை|கிடையாது|இல்லை\.)/,
  /(?:விவரம்|விவரங்கள்)(?:\s+\S+){0,3}\s+(?:இல்லை|கிடையாது)/,
  /தெரியவில்லை/,
  /எனக்குத் தெரியாது/,
  /\b(?:information|info|details?|jaankari|jankari|vivaram)(?:\s+\w+){0,2}\s+(?:illa|illai|nahi|nahin|ledhu|kidaiyathu|kedayathu)\b/i,
  /\b(?:enakku |naan )?(?:theriyala|theriyathu|therila)\b/i,
  /\b(?:mujhe |mujko )?(?:nahi|nahin) pata\b/i,
  /\bpata nahi\b/i,
];

export function declinesKnowledge(text: string): boolean {
  const t = text.trim();
  if (!t || asksAboutOffer(t) && /can(?:'|no)?t confirm any discount/i.test(t)) return false;
  if (/पुष्टि नहीं कर सकता/.test(t) || /confirm nahi kar sakta/i.test(t) || /உறுதிப்படுத்த முடியாது/.test(t) || /confirm panna mudiyathu/i.test(t)) return false;
  return REFUSAL.some((r) => r.test(t));
}

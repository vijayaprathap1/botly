/**
 * Per-message language detection for logging, reports and eval checks.
 * The model decides the reply language itself (system prompt rule 3); this
 * only labels what was written.
 */
export type Lang = "en" | "ta" | "hi" | "hinglish" | "tanglish" | "other";

const HINGLISH = new Set(
  "hai hain kya nahi nahin mujhe chahiye chaiye kitna kitne kitni milega milegi kab kaise kaisa aap aapko aapka hum humko bhai bhaiya bhaisahab ka ki ke mein tak se hoga hogi karo karna kar wala wali accha acha achha theek thik bata batao batana haan han ji hoti hota jata jaata jayega lagega lagenge din wapas paisa paise chahte sakte sakta sakti kuch koi kaun kyun kyu abhi yeh ye woh wo raha rahi dena dijiye bhej bhejo mera meri mere tum tumhara".split(" "),
);
const TANGLISH = new Set(
  "enna epdi eppadi eppo irukka irukku iruku irukkum venum vendum venam sollunga sollu pannunga panna pannalama anna akka evlo evalavu evvalavu romba konjam illa illai iruka kidaikuma kidaikum aagum aaguma naal naalil vaanga podunga seri sari da ma ungal unga enaku enakku naan neenga theriyuma theriyum vandhu varum varuma edhuku yenna kaasu thirumba mudiyuma mudiyum".split(" "),
);

export function detectLanguage(text: string): Lang {
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
  if (tamil / letters >= 0.25) return "ta";
  if (deva / letters >= 0.25) return "hi";

  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length === 0) return "other";
  let hi = 0;
  let ta = 0;
  for (const w of words) {
    if (HINGLISH.has(w)) hi++;
    if (TANGLISH.has(w)) ta++;
  }
  const need = words.length <= 4 ? 1 : 2;
  if (ta >= need && ta >= hi) return "tanglish";
  if (hi >= need && hi / words.length >= 0.12) return "hinglish";
  return "en";
}

export const LANGUAGE_LABEL: Record<Lang, string> = {
  en: "English",
  ta: "Tamil",
  hi: "Hindi",
  hinglish: "Hinglish",
  tanglish: "Tanglish",
  other: "Other",
};

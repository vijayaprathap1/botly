import { describe, expect, it } from "vitest";
import { detectLanguage } from "@/lib/language";

describe("detectLanguage", () => {
  it.each([
    ["Is cash on delivery available?", "en"],
    ["பாண்டிச்சேரிக்கு டெலிவரி எத்தனை நாள் ஆகும்?", "ta"],
    ["COD இருக்கா?", "ta"],
    ["क्या कैश ऑन डिलीवरी उपलब्ध है?", "hi"],
    ["Bhaiya COD milega kya Puducherry mein?", "hinglish"],
    ["Blouse ka size kitne tak hai? Mujhe 44 chahiye", "hinglish"],
    ["Haan ji, COD available hai, 3-4 din lagenge.", "hinglish"],
    ["COD irukka anna? Evlo naal aagum?", "tanglish"],
    ["Blouse stitching venum, evlo?", "tanglish"],
    ["👍", "other"],
  ])("%s → %s", (text, lang) => expect(detectLanguage(text)).toBe(lang));
});

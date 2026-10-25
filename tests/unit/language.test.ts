import { describe, expect, it } from "vitest";
import { detectLanguage } from "@/lib/language";
import { dominantScript, replyInstruction } from "@/lib/reply-style";

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
    ["रोमांस वाली किताबें कौन सी हैं?", "hi"],
    ["Classics ki kitaabein hain kya?", "hinglish"],
    ["philosophy books pathi sollunga, enna irukku?", "tanglish"],
  ])("%s → %s", (text, lang) => expect(detectLanguage(text)).toBe(lang));

  it("names the script the reply must use", () => {
    expect(dominantScript("रोमांस वाली किताबें")).toBe("devanagari");
    expect(dominantScript("மர்ம நாவல்கள் இருக்கா")).toBe("tamil");
    expect(dominantScript("COD milega kya?")).toBe("latin");
    expect(replyInstruction("रोमांस वाली किताबें")).toMatch(/Devanagari/);
    expect(replyInstruction("Bhaiya COD milega kya?")).toMatch(/Roman letters/);
    expect(replyInstruction("Bhaiya COD milega kya?")).toMatch(/Do not use Devanagari/);
    expect(replyInstruction("philosophy books pathi sollunga")).toMatch(/Do not use Tamil script/);
    expect(replyInstruction("மர்ம நாவல்கள்")).toMatch(/Tamil script/);
  });
});

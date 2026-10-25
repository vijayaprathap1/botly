import { Bricolage_Grotesque, Hind_Madurai, Mukta, Plus_Jakarta_Sans } from "next/font/google";

/**
 * Homepage fonts ("Warm local"). They are applied as CSS variables on the homepage wrapper only,
 * so the dashboard and the other marketing pages keep Geist until they are restyled.
 * latin-ext carries ₹ (U+20B9) for Bricolage and Jakarta. No per-font fallback lists: the stacks in
 * app/globals.css chain Latin → Tamil → Devanagari → system fonts, so a generic family never cuts in early.
 */
export const bricolage = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-bricolage",
});

export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-jakarta",
});

// Tamil is in the first screen at both widths, so it is preloaded.
export const hindMadurai = Hind_Madurai({
  subsets: ["tamil"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-hind-madurai",
});

// Devanagari: not preloaded (largest file); :lang(hi) still loads it when Hindi text is on screen.
export const mukta = Mukta({
  subsets: ["devanagari"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-mukta",
  preload: false,
});

export const homeFontVars = `${bricolage.variable} ${jakarta.variable} ${hindMadurai.variable} ${mukta.variable}`;

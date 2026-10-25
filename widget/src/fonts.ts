/**
 * Self-hosted widget fonts, injected into the HOST document once (Chrome ignores @font-face
 * declared inside a shadow root). Family names are prefixed "Botly " so they never clash with
 * the host page's fonts.
 *
 * Nothing is fetched at script load:
 * - Latin (Plus Jakarta Sans) is declared when the panel or nudge first shows.
 * - Tamil (Hind Madurai) and Devanagari (Mukta) are declared only when a message, chip or
 *   greeting in that script is about to be drawn (script detection below). unicode-range is a
 *   second guard: the browser downloads a face only when a character in its range is painted.
 * No preloads (third-party script; don't compete with the host page). font-display: swap, and
 * the CSS stack falls back to system Noto fonts, so text is never invisible.
 */
const TAMIL_RE = /[\u0B80-\u0BFF]/;
const DEVA_RE = /[\u0900-\u097F]/;

export type Script = "latin" | "tamil" | "deva";
export type IndicLang = "ta" | "hi";

/** Which Indic script dominates `text` (null for Latin-only text). Used for `lang` and font loading. */
export function indicLang(text: string): IndicLang | null {
  if (!text) return null;
  let ta = 0;
  let hi = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c >= 0x0b80 && c <= 0x0bff) ta++;
    else if (c >= 0x0900 && c <= 0x097f) hi++;
  }
  if (!ta && !hi) return null;
  return ta >= hi ? "ta" : "hi";
}

export function scriptsIn(text: string): Script[] {
  const out: Script[] = [];
  if (TAMIL_RE.test(text)) out.push("tamil");
  if (DEVA_RE.test(text)) out.push("deva");
  return out;
}

const LATIN_RANGE =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT_RANGE = "U+0100-02BA,U+20A0-20AB,U+20AD-20C0,U+2113,U+A720-A7FF";
const TAMIL_RANGE = "U+0964-0965,U+0B82-0BFA,U+200C-200D,U+20B9,U+25CC";
const DEVA_RANGE = "U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF";

function face(base: string, family: string, file: string, weight: string, range: string) {
  return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(${base}/widget-fonts/${file}) format("woff2");unicode-range:${range}}`;
}

export function fontFaces(base: string, script: Script): string {
  if (script === "latin")
    return (
      face(base, "Botly Jakarta", "plus-jakarta-sans-latin-wght-normal.woff2", "200 800", LATIN_RANGE) +
      face(base, "Botly Jakarta", "plus-jakarta-sans-latin-ext-wght-normal.woff2", "200 800", LATIN_EXT_RANGE)
    );
  if (script === "tamil")
    return (
      face(base, "Botly Tamil", "hind-madurai-tamil-400-normal.woff2", "400", TAMIL_RANGE) +
      face(base, "Botly Tamil", "hind-madurai-tamil-600-normal.woff2", "600", TAMIL_RANGE)
    );
  return (
    face(base, "Botly Deva", "mukta-devanagari-400-normal.woff2", "400", DEVA_RANGE) +
    face(base, "Botly Deva", "mukta-devanagari-600-normal.woff2", "600", DEVA_RANGE)
  );
}

export class FontLoader {
  private done = new Set<Script>();
  private style: HTMLStyleElement | null = null;
  constructor(private base: string) {}

  /** Declare the faces for one script (once). Never throws into the host page. */
  load(script: Script) {
    if (this.done.has(script)) return;
    this.done.add(script);
    try {
      if (!this.style) {
        this.style = document.getElementById("botly-fonts") as HTMLStyleElement | null;
        if (!this.style) {
          this.style = document.createElement("style");
          this.style.id = "botly-fonts";
          (document.head ?? document.documentElement).appendChild(this.style);
        }
      }
      this.style.appendChild(document.createTextNode(fontFaces(this.base, script)));
    } catch {
      /* fonts are an enhancement; system fonts still render every script */
    }
  }

  /** Load whatever Indic faces `text` needs. Returns the dominant Indic language, if any. */
  forText(text: string): IndicLang | null {
    for (const s of scriptsIn(text)) this.load(s);
    return indicLang(text);
  }
}

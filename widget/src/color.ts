/**
 * WCAG contrast helpers and the widget's theming maths.
 * The customer sets ONE colour (branding.primary_color). Everything else is derived so text
 * on it, and the colour used as text, always reaches 4.5:1 (CTO-HANDOFF §2).
 */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** White or black (black, not dark grey, so mid-tones still reach 4.5:1), whichever reads better on `bg`. */
export function readableTextOn(bg: string): "#ffffff" | "#000000" {
  return contrastRatio(bg, "#ffffff") >= contrastRatio(bg, "#000000") ? "#ffffff" : "#000000";
}

/** Botly's default accent (saffron) when a bot has no valid colour. */
export const DEFAULT_ACCENT = "#C2410C";
/** Botly ink and cream: the warm near-black and near-white used for text. */
export const INK = "#2B1D14";
export const CREAM = "#FFF3E3";

export function safeColor(hex: string | null | undefined, fallback = DEFAULT_ACCENT): string {
  return hex && parseHex(hex) ? (hex.startsWith("#") ? hex : "#" + hex) : fallback;
}

const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();

/** `a` moved toward `b` by `t` (0..1) in sRGB. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return a;
  return toHex(x.map((v, i) => v + (y[i]! - v) * t));
}

/**
 * Text and icons ON the accent (header, user bubble, send button): white or Botly ink,
 * whichever contrasts more. If neither reaches 4.5:1, pure white or black.
 */
export function onAccent(accent: string): string {
  const w = contrastRatio(accent, "#FFFFFF");
  const k = contrastRatio(accent, INK);
  if (Math.max(w, k) >= 4.5) return w >= k ? "#FFFFFF" : INK;
  return readableTextOn(accent) === "#ffffff" ? "#FFFFFF" : "#000000";
}

/**
 * The accent used AS text or borders (chip labels, links): stepped toward ink (light theme)
 * or cream (dark theme) in 10% mixes until it reaches 4.5:1 on every panel surface.
 */
export function accentText(accent: string, surfaces: string[], toward: string): string {
  let c = accent;
  for (let i = 0; i < 20 && surfaces.some((s) => contrastRatio(c, s) < 4.5); i++) c = mix(c, toward, 0.1);
  return c;
}

export const SURFACES = {
  light: { paper: "#FFFFFF", bg: "#FFF7EC" },
  dark: { paper: "#2B1D14", bg: "#1C130D" },
} as const;

/** Every CSS variable derived from the one brand colour, for the current theme. */
export function themeVars(color: string | null | undefined, dark: boolean): Record<string, string> {
  const accent = safeColor(color).toUpperCase();
  const { paper, bg } = dark ? SURFACES.dark : SURFACES.light;
  const on = onAccent(accent);
  return {
    "--p": accent,
    "--on-p": on,
    "--p-text": accentText(accent, [paper, bg], dark ? CREAM : INK),
    "--p-tint": mix(paper, accent, dark ? 0.22 : 0.1),
    "--p-line": mix(paper, accent, dark ? 0.55 : 0.4),
  };
}

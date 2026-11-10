/** Finding the <script> tag that loaded widget.js, and the bot key on it. */
export const keyOf = (s: HTMLScriptElement | null | undefined) => (s?.dataset.key || s?.dataset.botKey || "").trim();

/**
 * The <script> tag that loaded this file. document.currentScript is null for module scripts,
 * inside some tag managers and once the script has finished its first tick, so fall back to
 * the first widget.js tag that carries a key.
 */
export function findScript(doc: Document = document): HTMLScriptElement | null {
  const current = doc.currentScript as HTMLScriptElement | null;
  if (current && current.tagName === "SCRIPT" && keyOf(current)) return current;
  for (const s of Array.from(doc.querySelectorAll<HTMLScriptElement>('script[src*="widget.js"]'))) if (keyOf(s)) return s;
  return null;
}

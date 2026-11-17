/** DOM helpers shared by the widget and its booking flow. No dependencies. */
export const svg = (body: string, extra = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"') =>
  `<svg viewBox="0 0 24 24" ${extra} aria-hidden="true">${body}</svg>`;

/** Tiny element helper. Text goes through textContent only. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k === "text") el.textContent = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c != null) el.append(typeof c === "string" ? document.createTextNode(c) : c);
  return el;
}
/** Static, trusted SVG icons from this file only (never model output). */
export function icon(svgMarkup: string): HTMLElement {
  const s = document.createElement("span");
  s.style.display = "contents";
  s.innerHTML = svgMarkup;
  return s;
}

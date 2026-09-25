/** Storage that never throws (private mode, blocked cookies, sandboxed iframes). */
function store(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    const s = window[kind];
    const probe = "__botly__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
const mem = new Map<string, string>();

export function getJSON<T>(key: string, session = false): T | null {
  try {
    const raw = store(session ? "sessionStorage" : "localStorage")?.getItem(key) ?? mem.get(key) ?? null;
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setJSON(key: string, value: unknown, session = false): void {
  const raw = JSON.stringify(value);
  mem.set(key, raw);
  try {
    store(session ? "sessionStorage" : "localStorage")?.setItem(key, raw);
  } catch {
    /* quota or disabled: memory copy is enough for this page */
  }
}

export function randomId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  }
}

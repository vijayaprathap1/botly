/** "Please try again in 7.66s" / "in 1m2.5s" / "in 850ms" → milliseconds (+ a small margin), or null. */
export function rateLimitWaitMs(message: string): number | null {
  const ms = /try again in\s+([\d.]+)\s*ms\b/i.exec(message);
  if (ms) return Math.ceil(Number(ms[1])) + 250;
  const m = /try again in\s+(?:(\d+)m)?\s*([\d.]+)\s*s\b/i.exec(message);
  if (!m) return null;
  return Math.ceil((Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000) + 250;
}

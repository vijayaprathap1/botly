export type KnowledgeFilters = { type?: string; status?: string; q?: string };

/** Link for a Knowledge list filter; empty values are dropped. */
export function knowledgeFilterHref(base: string, f: KnowledgeFilters): string {
  const p = new URLSearchParams(Object.entries(f).filter(([, v]) => typeof v === "string" && v) as [string, string][]);
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

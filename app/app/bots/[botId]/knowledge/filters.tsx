"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition } from "react";
import { knowledgeFilterHref, type KnowledgeFilters } from "@/lib/knowledge-filters";

/**
 * Knowledge list filters (QA launch retest 2026-10-25). The chips used to be plain links:
 * while the next list loaded, the old list, its "N shown" count and the old highlighted chip
 * stayed on screen, so the page looked one click behind. Now the clicked chip is selected at
 * once and the list is dimmed (aria-busy) until the new one arrives.
 */
const Ctx = createContext<{ pending: boolean; selected: KnowledgeFilters; go: (next: KnowledgeFilters) => void } | null>(null);

export function KnowledgeFilterProvider({ base, filters, children }: { base: string; filters: KnowledgeFilters; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<{ for: string; value: KnowledgeFilters } | null>(null);
  const current = JSON.stringify(filters);
  // Once the server has rendered the requested filters, the server's props win again.
  const selected = optimistic && optimistic.for === current && pending ? optimistic.value : filters;
  const go = (next: KnowledgeFilters) => {
    setOptimistic({ for: current, value: next });
    startTransition(() => router.push(knowledgeFilterHref(base, next), { scroll: false }));
  };
  return <Ctx.Provider value={{ pending, selected, go }}>{children}</Ctx.Provider>;
}

const chip = (on: boolean) => `rounded-full px-2.5 py-1 ${on ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`;

export function KnowledgeFilterChips({ base, statuses, types }: { base: string; statuses: [string, string][]; types: readonly string[] }) {
  const ctx = useContext(Ctx)!;
  const { selected, go } = ctx;
  const status = selected.status ?? "active";
  const link = (next: KnowledgeFilters, on: boolean, label: string, key: string) => (
    <a
      key={key}
      href={knowledgeFilterHref(base, next)}
      aria-current={on ? "page" : undefined}
      className={chip(on)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        go(next);
      }}
    >
      {label}
    </a>
  );
  return (
    <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
      {statuses.map(([v, l]) => link({ ...selected, status: v }, status === v, l, `s-${v}`))}
      <span className="mx-1 text-zinc-300">|</span>
      {link({ ...selected, type: undefined }, !selected.type, "All types", "t-all")}
      {types.map((t) => link({ ...selected, type: t }, selected.type === t, t, `t-${t}`))}
    </div>
  );
}

export function KnowledgeFilterResults({ children }: { children: React.ReactNode }) {
  const { pending } = useContext(Ctx)!;
  return (
    <div aria-busy={pending} className={`relative transition-opacity ${pending ? "pointer-events-none opacity-50" : ""}`}>
      {pending ? <p role="status" className="absolute right-0 top-0 z-20 rounded bg-white px-2 text-sm text-zinc-500">Updating…</p> : null}
      {children}
    </div>
  );
}

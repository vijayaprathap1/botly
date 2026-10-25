import { beforeEach, describe, expect, it, vi } from "vitest";

// Onboarding must never put unreviewed AI text in front of visitors (QA audit R2).
const crawl = vi.hoisted(() => ({ crawlSite: vi.fn() }));
const draft = vi.hoisted(() => ({ draftKnowledge: vi.fn() }));
const safety = vi.hoisted(() => ({ runSafetyCheck: vi.fn() }));
vi.mock("@/lib/crawler/crawl", async (orig) => ({ ...(await orig<typeof import("@/lib/crawler/crawl")>()), crawlSite: crawl.crawlSite }));
vi.mock("@/lib/onboarding/draft", async (orig) => ({ ...(await orig<typeof import("@/lib/onboarding/draft")>()), draftKnowledge: draft.draftKnowledge }));
vi.mock("@/lib/eval/run", () => ({ runSafetyCheck: safety.runSafetyCheck, SAFETY_CASES: [{}, {}, {}, {}] }));
vi.mock("@/lib/llm", () => ({ getLlm: () => ({}) }));
vi.mock("@/lib/llm/provider", async (orig) => ({ ...(await orig<typeof import("@/lib/llm/provider")>()), requestTokenLimit: () => null }));
vi.mock("@/lib/retrieval/index-sync", () => ({ syncChunks: async () => {} }));

import { goLiveCheck, runOnboarding } from "@/lib/onboarding/pipeline";

type Call = { table: string; op: string; arg?: unknown; filters: [string, ...unknown[]][] };

/** Records every Supabase call; every query resolves to { data, error: null }. */
function fakeDb(isDemo: boolean) {
  const calls: Call[] = [];
  const bot = { id: "b1", org_id: "o1", model: null, org: { id: "o1", name: "Meenakshi Silks", is_demo: isDemo } };
  const db = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const result = () => {
        if (table === "bots" && call.op === "select") return { data: bot, error: null };
        return { data: [], error: null };
      };
      const q: Record<string, unknown> = {};
      for (const m of ["select", "insert", "update", "delete"]) {
        q[m] = (arg?: unknown) => {
          if (m !== "select" || call.op === "select") call.op = m;
          if (m !== "select") call.arg = arg;
          return q;
        };
      }
      for (const f of ["eq", "neq", "in", "is", "not", "or", "limit", "order"]) {
        q[f] = (...a: unknown[]) => {
          call.filters.push([f, ...a]);
          return q;
        };
      }
      q.single = async () => result();
      q.maybeSingle = async () => result();
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
      return q;
    },
  };
  return { db: db as never, calls };
}

const inserted = (calls: Call[]) => calls.filter((c) => c.table === "knowledge_sources" && c.op === "insert").flatMap((c) => c.arg as { type: string; status: string }[]);
const approvedPages = (calls: Call[]) =>
  calls.filter((c) => c.table === "knowledge_sources" && c.op === "update" && (c.arg as { status?: string }).status === "approved");

beforeEach(() => {
  vi.clearAllMocks();
  crawl.crawlSite.mockResolvedValue({
    pages: [{ title: "Home", url: "https://shop.test/", text: "Sarees since 1987" }],
    products: [{ title: "Bridal silk", url: "https://shop.test/products/bridal", content: "₹12,000" }],
    siteWide: "",
  });
  draft.draftKnowledge.mockResolvedValue({
    faqs: [{ question: "Do you ship?", answer: "Yes, across India in 5 days." }],
    policy: { returns: "7-day returns" },
    profile_markdown: "# Meenakshi Silks",
    suggested_questions: [],
  });
  safety.runSafetyCheck.mockResolvedValue({ passed: 4, total: 4, injectionPassed: true, inconclusive: false, results: [], firstTokenP50: null });
});

const opts = (db: never) => ({ db, botId: "b1", userId: "u1", url: "https://shop.test/", maxPages: 5, draft: true, selfServe: true, ownerNotes: "Open 10 to 8" });

describe("onboarding approvals", () => {
  it("self-serve saves drafted FAQs, policy, profile and products as drafts", async () => {
    const { db, calls } = fakeDb(false);
    const events: { stage: string; message: string }[] = [];
    await runOnboarding(opts(db), (e) => events.push(e));
    const rows = inserted(calls);
    expect(rows.map((r) => r.type).sort()).toEqual(["faq", "note", "page", "policy", "product"]);
    expect(rows.every((r) => r.status === "draft")).toBe(true);
    expect(approvedPages(calls)).toHaveLength(0);
    // The go-live check still runs, and covers the drafts the owner is about to approve.
    expect(safety.runSafetyCheck).toHaveBeenCalledTimes(1);
    const ks = calls.find((c) => c.table === "knowledge_sources" && c.filters.some(([f]) => f === "or"));
    expect(ks?.filters.find(([f]) => f === "or")?.[1]).toContain("status.eq.draft");
    const done = events.find((e) => e.stage === "done")!;
    expect(done.message).toMatch(/approve the drafted answers/);
    expect(events.some((e) => e.stage === "live")).toBe(true);
  });

  it("doesn't approve raw pages when drafting fails", async () => {
    draft.draftKnowledge.mockRejectedValue(new Error("model down"));
    const { db, calls } = fakeDb(false);
    await runOnboarding(opts(db), () => {});
    expect(approvedPages(calls)).toHaveLength(0);
    expect(inserted(calls).every((r) => r.status === "draft")).toBe(true);
  });

  it("admin-built demo workspaces are still approved straight away", async () => {
    const { db, calls } = fakeDb(true);
    await runOnboarding({ ...opts(db), skipSafetyCheck: true }, () => {});
    const rows = inserted(calls);
    expect(rows.filter((r) => r.type !== "page").every((r) => r.status === "approved")).toBe(true);
    expect(rows.filter((r) => r.type === "page").every((r) => r.status === "draft")).toBe(true);
    expect(safety.runSafetyCheck).not.toHaveBeenCalled();
  });

  it("the owner's own go-live check uses approved knowledge only", async () => {
    const { db, calls } = fakeDb(false);
    await goLiveCheck(db, "b1");
    const ks = calls.find((c) => c.table === "knowledge_sources")!;
    expect(ks.filters).toContainEqual(["eq", "status", "approved"]);
    expect(ks.filters.some(([f]) => f === "or")).toBe(false);
  });
});

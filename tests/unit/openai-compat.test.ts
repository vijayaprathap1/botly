import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiCompatLlm, chatTimeoutMs, firstByteTimeoutMs, openAiForcedToolCall, salvageTextToolCalls, toOpenAiMessages, withCacheBreakpoint } from "../../lib/llm/openai-compat";
import { llmProvider, resolveModel } from "../../lib/llm/provider";
import { pricingFor } from "../../lib/cost";
import type { ToolDef } from "../../lib/llm/types";

const TOOLS: ToolDef[] = [
  { name: "report_unanswered", description: "x", input_schema: { type: "object", properties: { question: { type: "string" } } } },
  { name: "suggest_followups", description: "y", input_schema: { type: "object", properties: {} } },
];

function sse(chunks: unknown[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  // Split mid-line to exercise buffering.
  const parts = [body.slice(0, 37), body.slice(37, 120), body.slice(120)];
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of parts) c.enqueue(new TextEncoder().encode(p));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}
const delta = (d: Record<string, unknown>, finish: string | null = null) => ({ choices: [{ delta: d, finish_reason: finish }] });

let calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
function mockFetch(res: () => Response) {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get("authorization") });
    return res();
  });
}

beforeEach(() => {
  calls = [];
  vi.stubEnv("LLM_PROVIDER", "nvidia");
  vi.stubEnv("LLM_API_KEY", "nvapi-test");
  vi.stubEnv("LLM_MODEL", "");
  vi.stubEnv("LLM_BASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provider selection", () => {
  it("nvidia maps to the OpenAI-compatible adapter with a default model", () => {
    expect(llmProvider()).toBe("openai");
    expect(resolveModel("claude-haiku-4-5")).toBe("qwen/qwen3-next-80b-a3b-instruct");
    expect(resolveModel("qwen/qwen3-235b-a22b")).toBe("qwen/qwen3-next-80b-a3b-instruct");
    vi.stubEnv("LLM_EXTRA_MODELS", "qwen/qwen3-235b-a22b");
    expect(resolveModel("qwen/qwen3-235b-a22b")).toBe("qwen/qwen3-235b-a22b");
    vi.stubEnv("LLM_MODEL", "openai/gpt-oss-120b");
    expect(resolveModel(null)).toBe("openai/gpt-oss-120b");
  });
  it("free-tier presets fill base URL, model and reasoning effort", async () => {
    const { openaiCompat, providerLabel } = await import("../../lib/llm/provider");
    vi.stubEnv("LLM_PROVIDER", "gemini");
    expect(openaiCompat.baseUrl()).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(providerLabel()).toBe("Google Gemini");
    expect(openaiCompat.reasoningEffort()).toBe("low");
    vi.stubEnv("LLM_PROVIDER", "groq");
    expect(resolveModel("claude-haiku-4-5")).toBe("openai/gpt-oss-120b");
    expect(resolveModel("gemini-3.5-flash")).toBe("openai/gpt-oss-120b");
    expect(resolveModel("openai/gpt-oss-20b")).toBe("openai/gpt-oss-20b");
    vi.stubEnv("LLM_REASONING_EFFORT", "off");
    expect(openaiCompat.reasoningEffort()).toBeNull();
  });
  it("retries without reasoning_effort when the server rejects it", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    let n = 0;
    mockFetch(() => (n++ === 0 ? new Response(JSON.stringify({ error: { message: "Unknown name reasoning_effort" } }), { status: 400 }) : sse([delta({ content: "ok" }, "stop")])));
    const turn = await new OpenAiCompatLlm().stream({ model: "gemini-3.5-flash", system: [], messages: [{ role: "user", content: "x" }], tools: [], maxTokens: 5 }, () => {});
    expect(turn.content).toEqual([{ type: "text", text: "ok" }]);
    expect(calls[0]!.body.reasoning_effort).toBe("low");
    expect(calls[1]!.body.reasoning_effort).toBeUndefined();
    expect(calls[1]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  });
  it("drops stream_options when a provider rejects it (Mistral-style 422)", async () => {
    vi.stubEnv("LLM_PROVIDER", "mistral");
    let n = 0;
    mockFetch(() => (n++ === 0 ? new Response(JSON.stringify({ detail: "Extra inputs are not permitted: stream_options" }), { status: 422 }) : sse([delta({ content: "hi" }, "stop")])));
    const turn = await new OpenAiCompatLlm().stream({ model: "mistral-small-latest", system: [], messages: [{ role: "user", content: "x" }], tools: [], maxTokens: 5 }, () => {});
    expect(turn.content).toEqual([{ type: "text", text: "hi" }]);
    expect(calls[0]!.url).toBe("https://api.mistral.ai/v1/chat/completions");
    expect(calls[1]!.body.stream_options).toBeUndefined();
  });
  it("retries a busy model once, then falls back to the next model", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    const busy = () => new Response(JSON.stringify([{ error: { code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" } }]), { status: 503 });
    let n = 0;
    mockFetch(() => (n++ < 2 ? busy() : sse([delta({ content: "ok" }, "stop")])));
    const turn = await new OpenAiCompatLlm().stream({ model: "gemini-3.5-flash", system: [], messages: [{ role: "user", content: "x" }], tools: [], maxTokens: 5 }, () => {});
    expect(turn.content).toEqual([{ type: "text", text: "ok" }]);
    expect(calls.map((c) => c.body.model)).toEqual(["gemini-3.5-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]);
  });
  it("a 404 for an unknown model falls through to the default and then the fallback", async () => {
    vi.stubEnv("LLM_PROVIDER", "groq");
    vi.stubEnv("LLM_FALLBACK_MODELS", "");
    const missing = () => new Response(JSON.stringify({ error: { message: "The model `openai/gpt-oss-20b` does not exist" } }), { status: 404 });
    let n = 0;
    mockFetch(() => (n++ === 0 ? missing() : sse([delta({ content: "ok" }, "stop")])));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const turn = await new OpenAiCompatLlm().stream({ model: "openai/gpt-oss-20b", system: [], messages: [{ role: "user", content: "x" }], tools: [], maxTokens: 5 }, () => {});
    warn.mockRestore();
    expect(turn.content).toEqual([{ type: "text", text: "ok" }]);
    expect(calls.map((c) => c.body.model)).toEqual(["openai/gpt-oss-20b", "openai/gpt-oss-120b"]);
  });
  it("reports Gemini's array-wrapped error message when every model is busy", async () => {
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("LLM_FALLBACK_MODELS", "");
    mockFetch(() => new Response(JSON.stringify([{ error: { code: 503, message: "This model is currently experiencing high demand." } }]), { status: 503 }));
    await expect(new OpenAiCompatLlm().stream({ model: "gemini-3.5-flash", system: [], messages: [{ role: "user", content: "x" }], tools: [], maxTokens: 5 }, () => {})).rejects.toThrow(
      "LLM API 503: This model is currently experiencing high demand.",
    );
    expect(calls).toHaveLength(2);
  });
  it("defaults to Anthropic", () => {
    vi.stubEnv("LLM_PROVIDER", "");
    expect(llmProvider()).toBe("anthropic");
    expect(resolveModel("claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });
  it("non-Claude models cost nothing unless priced", () => {
    expect(pricingFor("meta/llama-3.3-70b-instruct").pricing.output).toBe(0);
    expect(pricingFor("claude-unknown-9").pricing.output).toBe(5);
  });
});

describe("message translation", () => {
  it("turns tool_use/tool_result into tool_calls and tool messages in order", () => {
    const out = toOpenAiMessages("SYS", [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "Let me check." }, { type: "tool_use", id: "t1", name: "report_unanswered", input: { question: "q" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: '{"ok":true}' }] },
    ]);
    expect(out).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "Let me check.", tool_calls: [{ id: "t1", type: "function", function: { name: "report_unanswered", arguments: '{"question":"q"}' } }] },
      { role: "tool", tool_call_id: "t1", content: '{"ok":true}' },
    ]);
  });
});

describe("OpenAiCompatLlm.stream", () => {
  it("streams text, sends auth + tools, and reports usage", async () => {
    mockFetch(() =>
      sse([delta({ content: "COD is " }), delta({ content: "available." }, "stop"), { choices: [], usage: { prompt_tokens: 120, completion_tokens: 6 } }]),
    );
    const seen: string[] = [];
    const turn = await new OpenAiCompatLlm().stream(
      { model: "meta/llama-3.3-70b-instruct", system: [{ text: "S", cache: true }], messages: [{ role: "user", content: "COD?" }], tools: TOOLS, maxTokens: 400 },
      (t) => seen.push(t),
    );
    expect(seen.join("")).toBe("COD is available.");
    expect(turn.content).toEqual([{ type: "text", text: "COD is available." }]);
    expect(turn.stopReason).toBe("end_turn");
    expect(turn.usage).toMatchObject({ input: 120, output: 6 });
    expect(turn.firstTokenMs).not.toBeNull();
    expect(calls[0]!.url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(calls[0]!.auth).toBe("Bearer nvapi-test");
    expect((calls[0]!.body.tools as unknown[]).length).toBe(2);
    expect(calls[0]!.body.stream).toBe(true);
  });

  it("assembles tool calls whose arguments arrive in pieces", async () => {
    mockFetch(() =>
      sse([
        delta({ tool_calls: [{ index: 0, id: "call_1", function: { name: "report_unanswered", arguments: '{"quest' } }] }),
        delta({ tool_calls: [{ index: 0, function: { arguments: 'ion":"Japan?"}' } }] }, "tool_calls"),
      ]),
    );
    const turn = await new OpenAiCompatLlm().stream({ model: "m", system: [], messages: [{ role: "user", content: "Japan?" }], tools: TOOLS, maxTokens: 50 }, () => {});
    expect(turn.stopReason).toBe("tool_use");
    expect(turn.content).toEqual([{ type: "tool_use", id: "call_1", name: "report_unanswered", input: { question: "Japan?" } }]);
  });

  it("turns a tool call written as text JSON into a real call and never shows it", async () => {
    mockFetch(() => sse([delta({ content: '<|python_tag|>{"name": "report_unanswered", ' }), delta({ content: '"parameters": {"question": "Japan?"}}' }, "stop")]));
    const seen: string[] = [];
    const turn = await new OpenAiCompatLlm().stream({ model: "m", system: [], messages: [{ role: "user", content: "Japan?" }], tools: TOOLS, maxTokens: 50 }, (t) => seen.push(t));
    expect(seen.join("")).toBe("");
    expect(turn.stopReason).toBe("tool_use");
    expect(turn.content[0]).toMatchObject({ type: "tool_use", name: "report_unanswered", input: { question: "Japan?" } });
  });

  it("releases held text that turns out not to be a tool call", async () => {
    mockFetch(() => sse([delta({ content: "{ curly start" }), delta({ content: " but plain text" }, "stop")]));
    const seen: string[] = [];
    const turn = await new OpenAiCompatLlm().stream({ model: "m", system: [], messages: [{ role: "user", content: "x" }], tools: TOOLS, maxTokens: 50 }, (t) => seen.push(t));
    expect(seen.join("")).toBe("{ curly start but plain text");
    expect(turn.stopReason).toBe("end_turn");
  });

  it("turns a stuck request into a clear timeout error", async () => {
    vi.stubEnv("LLM_TIMEOUT_MS", "5000");
    vi.stubGlobal("fetch", (_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(init.signal!.reason))));
    const p = new OpenAiCompatLlm().stream({ model: "m", system: [], messages: [{ role: "user", content: "x" }], tools: [], maxTokens: 5 }, () => {});
    await expect(p).rejects.toThrow(/timed out after 5 s/);
  }, 10_000);

  it("surfaces the provider's error text", async () => {
    mockFetch(() => new Response(JSON.stringify({ detail: "Authentication failed" }), { status: 401 }));
    await expect(new OpenAiCompatLlm().stream({ model: "m", system: [], messages: [{ role: "user", content: "x" }], tools: [], maxTokens: 5 }, () => {})).rejects.toThrow(
      "LLM API 401: Authentication failed",
    );
  });
});

describe("helpers", () => {
  it("salvages several text tool calls and ignores unknown tools", () => {
    expect(salvageTextToolCalls('{"name":"report_unanswered","parameters":{"question":"a"}}; {"name":"suggest_followups","parameters":{}}', ["report_unanswered", "suggest_followups"])).toHaveLength(2);
    expect(salvageTextToolCalls('{"name":"delete_everything","parameters":{}}', ["report_unanswered"])).toBeNull();
    expect(salvageTextToolCalls("Hello there", ["report_unanswered"])).toBeNull();
  });

  it("forced tool call reads tool_calls, falling back to JSON in content", async () => {
    mockFetch(() => new Response(JSON.stringify({ choices: [{ message: { content: 'Here: {"faqs": [], "tone": "warm"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })));
    const r = await openAiForcedToolCall({ model: "m", system: "s", user: "u", tool: { name: "save_drafts", description: "d", input_schema: {} }, maxTokens: 100 });
    expect(r.input).toEqual({ faqs: [], tone: "warm" });
    expect(calls[0]!.body.tool_choice).toEqual({ type: "function", function: { name: "save_drafts" } });
  });
});

describe("rateLimitWaitMs", () => {
  it("reads the provider's suggested wait", async () => {
    const { rateLimitWaitMs } = await import("@/lib/llm/rate-limit");
    expect(rateLimitWaitMs("LLM API 429: Rate limit reached. Please try again in 7.66s. Need more tokens?")).toBe(7910);
    expect(rateLimitWaitMs("Please try again in 1m2.5s")).toBe(62750);
    expect(rateLimitWaitMs("Please try again in 850ms.")).toBe(1100);
    expect(rateLimitWaitMs("LLM API 429: quota exceeded")).toBeNull();
  });
});

describe("QA retest 2026-10-25: per-call timeout falls back to the smaller model", () => {
  const ask = () => new OpenAiCompatLlm().stream({ model: "openai/gpt-oss-120b", system: [], messages: [{ role: "user", content: "नमस्ते" }], tools: [], maxTokens: 50 }, () => {});
  const hangUntilAbort = (init: RequestInit) =>
    new Promise<Response>((_r, rej) => init.signal!.addEventListener("abort", () => rej(init.signal!.reason)));

  it("budgets: first model gets about half, onboarding waits the full time", () => {
    expect(firstByteTimeoutMs(25_000, 25_000)).toBe(12_500);
    expect(firstByteTimeoutMs(20_000, 20_000)).toBe(10_000);
    expect(firstByteTimeoutMs(5_000, 5_000)).toBeNull();
    expect(firstByteTimeoutMs(180_000, 180_000)).toBeNull();
    expect(chatTimeoutMs()).toBe(25_000);
    vi.stubEnv("LLM_TIMEOUT_MS", "90000");
    expect(chatTimeoutMs()).toBe(50_000); // always under the 60 s function limit
  });

  it("a stuck gpt-oss-120b is abandoned after its first-byte window and gpt-oss-20b answers", async () => {
    vi.stubEnv("LLM_PROVIDER", "groq");
    vi.stubEnv("LLM_TIMEOUT_MS", "20000");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const models: string[] = [];
      vi.stubGlobal("fetch", (_u: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        models.push(body.model);
        if (body.model === "openai/gpt-oss-120b") return hangUntilAbort(init);
        return Promise.resolve(sse([delta({ content: "नमस्ते! कैसे मदद करूँ?" }, "stop")]));
      });
      const p = ask();
      await vi.advanceTimersByTimeAsync(10_050);
      const turn = await p;
      expect(models).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
      expect(turn.content[0]).toMatchObject({ type: "text", text: "नमस्ते! कैसे मदद करूँ?" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up with a timeout error inside the budget when every model is stuck", async () => {
    vi.stubEnv("LLM_PROVIDER", "groq");
    vi.stubEnv("LLM_TIMEOUT_MS", "20000");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const models: string[] = [];
      vi.stubGlobal("fetch", (_u: string, init: RequestInit) => {
        models.push(JSON.parse(String(init.body)).model);
        return hangUntilAbort(init);
      });
      const p = ask();
      const caught = p.catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(20_100);
      const err = await caught;
      expect(String(err)).toMatch(/timed out after 10 s/);
      expect(models).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("OpenAI preset with Groq fallback", () => {
  const openaiEnv = () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
    vi.stubEnv("GROQ_API_KEY", "gsk-groq-test");
  };
  const req = { model: "gpt-6-luna", system: [], messages: [{ role: "user" as const, content: "x" }], tools: TOOLS, maxTokens: 50 };

  it("sends gpt-6-luna to OpenAI with reasoning_effort none, max_completion_tokens and tools", async () => {
    openaiEnv();
    mockFetch(() => sse([delta({ tool_calls: [{ index: 0, id: "c1", function: { name: "report_unanswered", arguments: '{"question":"q"}' } }] }, "tool_calls")]));
    expect(resolveModel("claude-haiku-4-5")).toBe("gpt-6-luna");
    const turn = await new OpenAiCompatLlm().stream(req, () => {});
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0]!.auth).toBe("Bearer sk-openai-test");
    expect(calls[0]!.body.reasoning_effort).toBe("none");
    expect(calls[0]!.body.max_completion_tokens).toBe(50);
    expect(calls[0]!.body.max_tokens).toBeUndefined();
    expect(calls[0]!.body.tools).toHaveLength(2);
    expect(turn.stopReason).toBe("tool_use");
    expect(turn.content).toEqual([{ type: "tool_use", id: "c1", name: "report_unanswered", input: { question: "q" } }]);
  });

  it("falls back to Groq gpt-oss-120b with Groq's key and effort when OpenAI rejects the key", async () => {
    openaiEnv();
    let n = 0;
    mockFetch(() => (n++ === 0 ? new Response(JSON.stringify({ error: { message: "Incorrect API key provided" } }), { status: 401 }) : sse([delta({ content: "ok" }, "stop")])));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const turn = await new OpenAiCompatLlm().stream(req, () => {});
    warn.mockRestore();
    expect(turn.content).toEqual([{ type: "text", text: "ok" }]);
    expect(calls[1]!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(calls[1]!.auth).toBe("Bearer gsk-groq-test");
    expect(calls[1]!.body.model).toBe("openai/gpt-oss-120b");
    expect(calls[1]!.body.reasoning_effort).toBe("low");
    expect(calls[1]!.body.max_tokens).toBe(50);
    expect(calls[1]!.body.max_completion_tokens).toBeUndefined();
  });

  it("falls back to Groq when OpenAI is overloaded (429 twice)", async () => {
    openaiEnv();
    let n = 0;
    mockFetch(() => (n++ < 2 ? new Response(JSON.stringify({ error: { message: "You exceeded your current quota" } }), { status: 429 }) : sse([delta({ content: "ok" }, "stop")])));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await new OpenAiCompatLlm().stream(req, () => {});
    warn.mockRestore();
    expect(calls.map((c) => c.body.model)).toEqual(["gpt-6-luna", "gpt-6-luna", "openai/gpt-oss-120b"]);
  });

  it("goes straight to Groq when the OpenAI key is missing", async () => {
    openaiEnv();
    vi.stubEnv("OPENAI_API_KEY", "");
    mockFetch(() => sse([delta({ content: "ok" }, "stop")]));
    await new OpenAiCompatLlm().stream(req, () => {});
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("uses LLM_API_KEY for Groq only when it is not the OpenAI key", async () => {
    const { openaiCompat } = await import("../../lib/llm/provider");
    openaiEnv();
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "gsk-old-groq");
    expect(openaiCompat.apiKey()).toBe("sk-openai-test");
    expect(openaiCompat.fallbackApiKey()).toBe("gsk-old-groq");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("LLM_API_KEY", "sk-openai-test");
    expect(openaiCompat.apiKey()).toBe("sk-openai-test");
    expect(openaiCompat.fallbackApiKey()).toBe("");
  });

  it("is switchable by env: effort, fallback off, and back to groq", async () => {
    const { openaiCompat, requestTokenLimit, providerLabel } = await import("../../lib/llm/provider");
    openaiEnv();
    expect(providerLabel()).toBe("OpenAI");
    expect(requestTokenLimit()).toBe(7500); // stays under the Groq fallback's free-tier size
    vi.stubEnv("LLM_REASONING_EFFORT", "low");
    expect(openaiCompat.reasoningEffort()).toBe("low");
    vi.stubEnv("LLM_REASONING_EFFORT", "off");
    expect(openaiCompat.reasoningEffort()).toBeNull();
    vi.stubEnv("LLM_FALLBACK_PROVIDER", "off");
    expect(openaiCompat.fallbackTargets()).toEqual([]);
    expect(requestTokenLimit()).toBeNull();
    vi.stubEnv("LLM_PROVIDER", "groq");
    vi.stubEnv("LLM_FALLBACK_PROVIDER", "");
    vi.stubEnv("LLM_REASONING_EFFORT", "");
    expect(openaiCompat.fallbackTargets()).toEqual([]);
    expect(openaiCompat.baseUrl()).toBe("https://api.groq.com/openai/v1");
    expect(openaiCompat.reasoningEffort()).toBe("low");
  });

  it("does not fall back from Groq to another provider (existing groq path unchanged)", async () => {
    vi.stubEnv("LLM_PROVIDER", "groq");
    vi.stubEnv("LLM_API_KEY", "gsk-test");
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
    mockFetch(() => new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 }));
    await expect(new OpenAiCompatLlm().stream({ ...req, model: "openai/gpt-oss-120b" }, () => {})).rejects.toThrow("LLM API 401");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
  });
});

describe("OpenAI reply speed: cache breakpoint and timeouts", () => {
  const openaiEnv = () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
    vi.stubEnv("GROQ_API_KEY", "gsk-groq-test");
  };
  const req = {
    model: "gpt-6-luna",
    system: [{ text: "STATIC", cache: true }, { text: "CONTEXT" }],
    messages: [{ role: "user" as const, content: "x" }],
    tools: TOOLS,
    maxTokens: 50,
  };

  it("sends the system prompt as parts with a cache breakpoint after the static part (same text)", async () => {
    openaiEnv();
    mockFetch(() => sse([delta({ content: "ok" }, "stop")]));
    await new OpenAiCompatLlm().stream(req, () => {});
    const sys = (calls[0]!.body.messages as { role: string; content: { text: string; prompt_cache_breakpoint?: unknown }[] }[])[0]!;
    expect(sys.role).toBe("system");
    expect(sys.content.map((p) => p.text).join("")).toBe("STATIC\n\nCONTEXT");
    expect(sys.content[0]!.prompt_cache_breakpoint).toEqual({ mode: "explicit" });
    expect(sys.content[1]!.prompt_cache_breakpoint).toBeUndefined();
    expect(calls[0]!.body.__systemParts).toBeUndefined();
  });

  it("Groq (fallback or main) still gets the plain system string", async () => {
    openaiEnv();
    let n = 0;
    mockFetch(() => (n++ === 0 ? new Response(JSON.stringify({ error: { message: "Incorrect API key provided" } }), { status: 401 }) : sse([delta({ content: "ok" }, "stop")])));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await new OpenAiCompatLlm().stream(req, () => {});
    warn.mockRestore();
    expect(calls[1]!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((calls[1]!.body.messages as { content: unknown }[])[0]!.content).toBe("STATIC\n\nCONTEXT");
  });

  it("retries with the plain string when the server rejects prompt_cache_breakpoint", async () => {
    openaiEnv();
    let n = 0;
    mockFetch(() => (n++ === 0 ? new Response(JSON.stringify({ error: { message: "prompt_cache_breakpoint is not supported on this model" } }), { status: 400 }) : sse([delta({ content: "ok" }, "stop")])));
    await new OpenAiCompatLlm().stream(req, () => {});
    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect((calls[1]!.body.messages as { content: unknown }[])[0]!.content).toBe("STATIC\n\nCONTEXT");
  });

  it("leaves messages alone without a cacheable block", () => {
    const m = [{ role: "system" as const, content: "S" }];
    expect(withCacheBreakpoint(m, [{ text: "S" }])).toBe(m);
  });

  it("OpenAI waits 25 s for the response to start and 35 s in total; env overrides", async () => {
    const { openaiCompat } = await import("../../lib/llm/provider");
    openaiEnv();
    expect(chatTimeoutMs()).toBe(35_000);
    const luna = openaiCompat.mainTarget("gpt-6-luna");
    expect(firstByteTimeoutMs(35_000, 35_000, luna)).toBe(25_000);
    // Groq targets keep the old window.
    expect(firstByteTimeoutMs(25_000, 25_000, openaiCompat.fallbackTargets()[0])).toBe(12_500);
    vi.stubEnv("LLM_FIRST_TOKEN_TIMEOUT_MS", "18000");
    expect(firstByteTimeoutMs(35_000, 35_000, luna)).toBe(18_000);
    vi.stubEnv("LLM_TIMEOUT_MS", "45000");
    expect(chatTimeoutMs()).toBe(45_000);
    // Not enough left for the fallback: no early give-up.
    vi.stubEnv("LLM_FIRST_TOKEN_TIMEOUT_MS", "");
    expect(firstByteTimeoutMs(30_000, 30_000, luna)).toBeNull();
  });

  it("a slow OpenAI start falls back to Groq only after 25 s", async () => {
    openaiEnv();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const seen: { url: string; at: number }[] = [];
      const t0 = Date.now();
      vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
        seen.push({ url, at: Date.now() - t0 });
        if (url.includes("openai.com"))
          return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
        return Promise.resolve(sse([delta({ content: "ok" }, "stop")]));
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const p = new OpenAiCompatLlm().stream(req, () => {});
      await vi.advanceTimersByTimeAsync(24_000);
      expect(seen).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(2_000);
      const turn = await p;
      warn.mockRestore();
      expect(turn.content).toEqual([{ type: "text", text: "ok" }]);
      expect(seen[1]!.url).toContain("api.groq.com");
      expect(seen[1]!.at).toBeGreaterThanOrEqual(25_000);
    } finally {
      vi.useRealTimers();
    }
  });
});

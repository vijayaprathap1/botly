import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiCompatLlm, openAiForcedToolCall, salvageTextToolCalls, toOpenAiMessages } from "../../lib/llm/openai-compat";
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
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provider selection", () => {
  it("nvidia maps to the OpenAI-compatible adapter with a default model", () => {
    expect(llmProvider()).toBe("openai");
    expect(resolveModel("claude-haiku-4-5")).toBe("qwen/qwen3-next-80b-a3b-instruct");
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

/**
 * OpenAI-compatible Chat Completions adapter (NVIDIA build.nvidia.com, OpenRouter, Groq,
 * Together, vLLM, OpenAI itself…). Translates Botly's Anthropic-shaped requests and
 * tool calls to/from the Chat Completions format and streams text deltas.
 * No SDK: plain fetch + SSE parsing, so it runs anywhere (Vercel, Node, tests).
 */
import type { LlmClient, LlmMessage, LlmRequest, LlmTurn, TextPart, ToolDef, ToolUsePart } from "./types";
import { acquireAiBudget, adjustAiBudget, AiBudgetError, estimateRequestTokens, holdReservation, noteAiUsage, onboardingReserveTokens } from "./budget";
import { openaiCompat } from "./provider";
import { rateLimitWaitMs } from "./rate-limit";
import { parseTextToolCalls, TextToolFilter } from "./text-tool-filter";

type OaiToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type OaiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OaiToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** Anthropic-shaped history → Chat Completions messages. */
export function toOpenAiMessages(system: string, messages: LlmMessage[]): OaiMessage[] {
  const out: OaiMessage[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content } as OaiMessage);
      continue;
    }
    if (m.role === "assistant") {
      const text = m.content.filter((p): p is TextPart => p.type === "text").map((p) => p.text).join("");
      const calls = m.content
        .filter((p): p is ToolUsePart => p.type === "tool_use")
        .map((p) => ({ id: p.id, type: "function" as const, function: { name: p.name, arguments: JSON.stringify(p.input ?? {}) } }));
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      // Tool results must directly follow the assistant message that asked for them.
      for (const p of m.content) if (p.type === "tool_result") out.push({ role: "tool", tool_call_id: p.tool_use_id, content: p.content });
      const text = m.content.filter((p): p is TextPart => p.type === "text").map((p) => p.text).join("\n");
      if (text) out.push({ role: "user", content: text });
    }
  }
  return out;
}

export function toOpenAiTools(tools: ToolDef[]) {
  return tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

function mapStop(reason: string | null, hasTools: boolean): string | null {
  if (hasTools) return "tool_use";
  if (reason === "length") return "max_tokens";
  if (reason === "stop" || reason === "eos") return "end_turn";
  return reason;
}

function parseArgs(s: string): Record<string, unknown> {
  if (!s) return {};
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Some open models (Llama especially) occasionally write a tool call as plain text
 * instead of a structured tool_call. Recognise the common shapes so the call still runs
 * and the raw JSON never reaches the visitor.
 */
export function salvageTextToolCalls(text: string, toolNames: string[]): ToolUsePart[] | null {
  const t = text.trim();
  // Only when the whole text is tool calls (used for non-streamed replies).
  if (!/^(<\|python_tag\|>|```|\{|\[)/.test(t) && !toolNames.some((n) => t.startsWith(n))) return null;
  const calls = parseTextToolCalls(t, toolNames);
  return calls.length ? calls : null;
}

const loggedMissingModels = new Set<string>();

/** 404, or a body that says this model id is gone. Not a transient overload. */
function missingModel(message: string): boolean {
  return /LLM API 404\b|model_not_found|does not exist|do not exist|decommissioned|unknown model|model .* not found|no such model/i.test(message);
}

function noteMissingModel(model: string, message: string) {
  if (loggedMissingModels.has(model)) return;
  loggedMissingModels.add(model);
  console.warn(`[llm] model ${model} is not available (${message.slice(0, 140)}); trying the next configured model`);
}

/** Adds reasoning_effort when configured; retries once without it if the server rejects it. */
async function postChat(body: Record<string, unknown>, signal?: AbortSignal, timeoutMs?: number): Promise<Response> {
  const effort = openaiCompat.reasoningEffort();
  let payload: Record<string, unknown> = effort ? { ...body, reasoning_effort: effort } : body;
  // Requested id, then the configured default, then fallbacks. A 404 skips the busy retry.
  const models = [...new Set([String(body.model), openaiCompat.model(), ...openaiCompat.fallbackModels()].filter(Boolean))];
  let modelIdx = 0;
  let busyRetried = false;
  let waited = false;
  let fieldDrops = 0;
  const callTimeout = timeoutMs ?? chatTimeoutMs();
  // Onboarding drafts use a long timeout. Wait out a per-minute budget dip instead of failing the import.
  const onboarding = callTimeout >= 60_000;
  const estimate = estimateRequestTokens(body, Number(body.max_tokens) || 400) + (onboarding ? onboardingReserveTokens() : 0);
  const reserved = await acquireAiBudget({ tokens: estimate, waitMs: onboarding ? Math.min(45_000, callTimeout - 30_000) : 0 });
  const releaseIfMissing = async (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (reserved > 0 && missingModel(msg)) await adjustAiBudget(-reserved);
  };
  // One deadline for the whole call (all models). A model that has not started answering
  // within its first-byte window is treated as busy and the next model gets the rest.
  const deadline = Date.now() + callTimeout;
  for (;;) {
    const remaining = deadline - Date.now();
    const hasNext = modelIdx < models.length - 1;
    const firstByte = hasNext ? firstByteTimeoutMs(callTimeout, remaining) : null;
    try {
      const res = await post("/chat/completions", payload, signal, Math.max(1_000, remaining), firstByte ?? undefined);
      holdReservation(res, reserved);
      return res;
    } catch (e) {
      if (e instanceof AiBudgetError) throw e;
      const msg = e instanceof Error ? e.message : "";
      // No first byte in time (stuck queue, slow free tier): try the next model while time is left.
      if (isTimeout(msg) && !signal?.aborted) {
        if (++modelIdx >= models.length || deadline - Date.now() < MIN_FALLBACK_MS) throw e;
        console.warn(`[llm] ${models[modelIdx - 1]} timed out (${msg.slice(0, 40)}), falling back to ${models[modelIdx]}`);
        payload = { ...payload, model: models[modelIdx] };
        busyRetried = false;
        continue;
      }
      // Optional extras some providers reject (Mistral, GitHub Models…): drop the one named in the error.
      const field = fieldDrops < 2 && /LLM API (400|422)/.test(msg) ? OPTIONAL_FIELDS.find((f) => f in payload && new RegExp(f.split("_")[0]!, "i").test(msg)) : undefined;
      if (field) {
        fieldDrops++;
        const { [field]: _dropped, ...rest } = payload;
        payload = rest;
        continue;
      }
      // Unknown or retired id: do not retry it. Walk default + fallbacks once.
      if (missingModel(msg) && !signal?.aborted) {
        noteMissingModel(String(payload.model), msg);
        if (++modelIdx >= models.length) {
          await releaseIfMissing(e);
          throw e;
        }
        payload = { ...payload, model: models[modelIdx] };
        busyRetried = false;
        continue;
      }
      if (!/LLM API (429|500|502|503|504|529)/.test(msg) || signal?.aborted) throw e;
      if (!busyRetried) {
        busyRetried = true;
        await new Promise((r) => setTimeout(r, 700));
        continue;
      }
      if (++modelIdx >= models.length) {
        // Every model is rate-limited. Per-minute limits refill within seconds: when the
        // provider says how long, wait once (if it fits the request) and start over.
        const waitMs = /LLM API 429/.test(msg) ? rateLimitWaitMs(msg) : null;
        if (waited || waitMs === null || waitMs > MAX_RATE_LIMIT_WAIT_MS || waitMs > deadline - Date.now() - MIN_FALLBACK_MS) throw e;
        waited = true;
        console.warn(`[llm] all models rate-limited, waiting ${Math.round(waitMs / 100) / 10}s`);
        await new Promise((r) => setTimeout(r, waitMs));
        if (signal?.aborted) throw e;
        modelIdx = 0;
        payload = { ...payload, model: models[0] };
        busyRetried = true; // one attempt per model after the wait
        continue;
      }
      console.warn(`[llm] ${models[modelIdx - 1]} busy (${msg.slice(0, 60)}), falling back to ${models[modelIdx]}`);
      payload = { ...payload, model: models[modelIdx] };
      busyRetried = false;
    }
  }
}
const OPTIONAL_FIELDS = ["reasoning_effort", "stream_options"];

/** The next model in the fallback chain after this one, if any. */
function fallbackAfter(model: string): string | null {
  const chain = [...new Set([openaiCompat.model(), ...openaiCompat.fallbackModels()].filter(Boolean))];
  const i = chain.indexOf(model);
  if (i === -1) return chain.find((m) => m !== model) ?? null;
  return chain[i + 1] ?? null;
}

/** Longest pause inside one chat request (the visitor sees the typing dots meanwhile). */
const MAX_RATE_LIMIT_WAIT_MS = 15_000;


/** Below this much time left, a fallback model would only produce a half reply. */
const MIN_FALLBACK_MS = 4_000;

/**
 * Per-call timeout (all models together). Chat replies must finish inside the 60 s
 * serverless limit (with a possible tool round), so a stuck free-tier queue falls back
 * to the next model, then to the contact card. The widget waits longer than this.
 */
export function chatTimeoutMs(): number {
  const v = Number(process.env.LLM_TIMEOUT_MS);
  return Number.isFinite(v) && v >= 5_000 ? Math.min(v, 50_000) : 25_000;
}

/**
 * How long the first model may take to start answering before the next model is tried:
 * about half the chat budget (8–15 s), leaving the fallback enough time. Long onboarding
 * calls (60 s+) wait the full time.
 */
export function firstByteTimeoutMs(callTimeout: number, remaining: number): number | null {
  if (callTimeout >= 60_000) return null;
  const t = Math.min(15_000, Math.max(8_000, Math.round(callTimeout / 2)));
  return remaining - t >= MIN_FALLBACK_MS * 2 ? t : null;
}

function isTimeout(msg: string): boolean {
  return /^LLM API timed out after/.test(msg);
}

async function post(path: string, body: unknown, signal?: AbortSignal, timeoutMs = chatTimeoutMs(), firstByteMs?: number): Promise<Response> {
  const key = openaiCompat.apiKey();
  if (!key) throw new Error("LLM_API_KEY is not set");
  // Two limits: the response must start within firstByteMs (when set), and the whole
  // response, including the streamed body, must finish within timeoutMs.
  const started = Date.now();
  const ctl = new AbortController();
  let fired = 0;
  const arm = (ms: number) => {
    const t = setTimeout(() => {
      fired = ms;
      ctl.abort(new DOMException("LLM call timed out", "TimeoutError"));
    }, ms);
    (t as { unref?: () => void }).unref?.();
    return t;
  };
  const headerTimer = arm(Math.min(firstByteMs ?? timeoutMs, timeoutMs));
  let res: Response;
  try {
    res = await fetch(`${openaiCompat.baseUrl()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: body && (body as { stream?: boolean }).stream ? "text/event-stream" : "application/json" },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, ctl.signal]) : ctl.signal,
    });
  } catch (e) {
    clearTimeout(headerTimer);
    if (ctl.signal.aborted && !signal?.aborted)
      throw new Error(`LLM API timed out after ${Math.round(fired / 1000)} s (model ${String((body as { model?: string })?.model ?? openaiCompat.model())} is busy or too slow)`);
    throw e;
  }
  clearTimeout(headerTimer);
  if (res.ok) arm(Math.max(1_000, timeoutMs - (Date.now() - started)));
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text.slice(0, 300);
    try {
      let j = JSON.parse(text) as { error?: { message?: string } | string; detail?: string; message?: string };
      if (Array.isArray(j)) j = j[0] ?? {}; // Gemini wraps errors in an array
      msg = (typeof j.error === "string" ? j.error : j.error?.message) ?? j.detail ?? j.message ?? msg;
    } catch {
      /* keep raw text */
    }
    throw new Error(`LLM API ${res.status}: ${msg}`);
  }
  return res;
}

type Chunk = {
  choices?: { delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | null;
};

export class OpenAiCompatLlm implements LlmClient {
  async stream(req: LlmRequest, onText: (t: string) => void): Promise<LlmTurn> {
    const started = Date.now();
    const toolNames = req.tools.map((t) => t.name);
    const res = await postChat(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        temperature: 0.2,
        stream: true,
        stream_options: { include_usage: true },
        messages: toOpenAiMessages(req.system.map((b) => b.text).join("\n\n"), req.messages),
        ...(req.tools.length ? { tools: toOpenAiTools(req.tools), tool_choice: "auto" } : {}),
      },
      req.signal,
    );
    if (!res.body) throw new Error("LLM API returned no stream");

    let text = "";
    let firstTokenMs: number | null = null;
    let finish: string | null = null;
    const calls = new Map<number, { id: string; name: string; args: string }>();
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    // Tool calls some models write as text are caught here and never shown.
    const filter = new TextToolFilter(toolNames, (t) => {
      if (!t) return;
      if (firstTokenMs === null) firstTokenMs = Date.now() - started;
      onText(t);
    });
    const onDelta = (t: string) => {
      text += t;
      filter.push(t);
    };

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    outer: for (;;) {
      let chunkRead: ReadableStreamReadResult<string>;
      try {
        chunkRead = await reader.read();
      } catch (e) {
        if (e instanceof Error && /timeout|abort/i.test(`${e.name} ${e.message}`)) {
          // Nothing shown yet: the visitor loses nothing if a smaller model answers instead.
          const next = fallbackAfter(req.model);
          const left = chatTimeoutMs() - (Date.now() - started);
          if (!text && calls.size === 0 && next && !req.signal?.aborted && left >= MIN_FALLBACK_MS && !(req as { _retried?: boolean })._retried) {
            console.warn(`[llm] ${req.model} timed out before the first token, retrying on ${next}`);
            return this.stream({ ...req, model: next, _retried: true } as LlmRequest, onText);
          }
          throw new Error(`LLM API timed out mid-reply (model ${req.model}); try a faster LLM_MODEL`);
        }
        throw e;
      }
      const { value, done } = chunkRead;
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") break outer;
        let chunk: Chunk;
        try {
          chunk = JSON.parse(data) as Chunk;
        } catch {
          continue;
        }
        if (chunk.usage) {
          const cached = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
          usage.input = Math.max(0, (chunk.usage.prompt_tokens ?? 0) - cached);
          usage.cacheRead = cached;
          usage.output = chunk.usage.completion_tokens ?? 0;
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.delta?.content) onDelta(choice.delta.content);
        for (const tc of choice.delta?.tool_calls ?? []) {
          const i = tc.index ?? 0;
          const cur = calls.get(i) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          calls.set(i, cur);
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
    }

    let toolUses: ToolUsePart[] = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, c]) => c.name)
      .map(([, c]) => ({ type: "tool_use", id: c.id || `call_${crypto.randomUUID().slice(0, 12)}`, name: c.name, input: parseArgs(c.args) }));
    const filtered = filter.end();
    const visibleText = filtered.text;
    // Structured calls win; text-written calls are used only when there are none (no duplicates).
    if (!toolUses.length) toolUses = filtered.toolUses;

    const content: (TextPart | ToolUsePart)[] = [];
    if (visibleText.trim()) content.push({ type: "text", text: visibleText });
    content.push(...toolUses);
    if (!usage.output) usage.output = Math.ceil(text.length / 4); // providers that omit usage
    await noteAiUsage(res, usage.input + usage.output + usage.cacheRead + usage.cacheWrite);
    return { content, stopReason: mapStop(finish, toolUses.length > 0), usage, firstTokenMs };
  }
}

/** One non-streamed call that must answer through `tool` (used for onboarding drafts). */
export async function openAiForcedToolCall(args: {
  model: string;
  system: string;
  user: string;
  tool: ToolDef;
  maxTokens: number;
}): Promise<{ input: Record<string, unknown>; usage: { input: number; output: number } }> {
  const body = {
    model: args.model,
    max_tokens: args.maxTokens,
    temperature: 0.2,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    tools: toOpenAiTools([args.tool]),
    tool_choice: { type: "function", function: { name: args.tool.name } },
  };
  let res: Response;
  try {
    res = await postChat(body, undefined, 180_000);
  } catch (e) {
    // Some servers reject a named tool_choice; "required"/"auto" still work.
    if (!(e instanceof Error) || !/tool_choice|400|422/.test(e.message)) throw e;
    res = await postChat({ ...body, tool_choice: "auto" }, undefined, 180_000);
  }
  const j = (await res.json()) as {
    choices?: { message?: { content?: string | null; tool_calls?: OaiToolCall[] } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  await noteAiUsage(res, (j.usage?.prompt_tokens ?? 0) + (j.usage?.completion_tokens ?? 0));
  const msg = j.choices?.[0]?.message;
  const call = msg?.tool_calls?.find((c) => c.function?.name === args.tool.name) ?? msg?.tool_calls?.[0];
  let input = call ? parseArgs(call.function.arguments) : null;
  if (!input && msg?.content) input = salvageTextToolCalls(msg.content, [args.tool.name])?.[0]?.input ?? extractJsonObject(msg.content);
  if (!input) throw new Error("The model did not return drafts");
  return { input, usage: { input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0 } };
}

function extractJsonObject(s: string): Record<string, unknown> | null {
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  const v = parseArgs(s.slice(a, b + 1));
  return Object.keys(v).length ? v : null;
}

/** 1-token live check. Returns the provider's own error text, never the key. */
export async function openAiPing(): Promise<string | null> {
  try {
    // max_tokens > 1: thinking models spend a few tokens before answering.
    await postChat({ model: openaiCompat.model(), max_tokens: 16, messages: [{ role: "user", content: "Say ok" }] }, undefined, 20_000);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "unreachable";
  }
}

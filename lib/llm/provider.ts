/**
 * Which LLM backend Botly talks to.
 *
 *   LLM_PROVIDER=anthropic (default)  → Anthropic Messages API (ANTHROPIC_API_KEY)
 *   LLM_PROVIDER=openai               → OpenAI itself (OPENAI_API_KEY, default gpt-6-luna with
 *                                        reasoning effort "none"), falling back to Groq
 *   LLM_PROVIDER=gemini | groq | cerebras | mistral | github | openrouter | nvidia | sarvam
 *                                     → any OpenAI-compatible Chat Completions API
 *                                        (LLM_API_KEY, optional LLM_MODEL / LLM_BASE_URL)
 *   LLM_PROVIDER=openai-compatible    → any other OpenAI-compatible API (set LLM_BASE_URL)
 *
 * The named presets pre-fill the base URL and a default model with tool calling.
 * A preset may name a fallback provider (LLM_FALLBACK_PROVIDER overrides, "off" disables):
 * when every model on the main provider fails, times out or has no key, the same request
 * goes to that provider with its own key, model and reasoning effort.
 */
export type Provider = "anthropic" | "openai";

/**
 * Presets for OpenAI-compatible providers with a free tier. LLM_BASE_URL / LLM_MODEL
 * override them. Model ids change: confirm the current id in the provider's console.
 */
/** requestTokens = the most one request may carry (input + output) on that provider's free tier. */
type Preset = {
  baseUrl: string;
  model: string;
  label: string;
  reasoningEffort?: string;
  fallbacks?: string[];
  requestTokens?: number;
  /** The provider's own key variable, used when this preset is the fallback provider. */
  keyEnv?: string;
  /** Another preset to try when this provider fails (LLM_FALLBACK_PROVIDER overrides). */
  fallbackProvider?: string;
};
const PRESETS: Record<string, Preset> = {
  // Paid. GPT-6 Luna only supports function calling in Chat Completions with reasoning_effort "none"
  // (https://developers.openai.com/api/docs/models/gpt-6-luna), so the preset sends "none" explicitly.
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-6-luna", label: "OpenAI", reasoningEffort: "none", keyEnv: "OPENAI_API_KEY", fallbackProvider: "groq" },
  // Small-active-parameter MoE: fast on the shared free queue, strong multilingual (Tamil/Hindi), tool calling.
  nvidia: { baseUrl: "https://integrate.api.nvidia.com/v1", model: "qwen/qwen3-next-80b-a3b-instruct", label: "NVIDIA" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.5-flash", label: "Google Gemini", reasoningEffort: "low", fallbacks: ["gemini-3.5-flash-lite", "gemini-3.8-flash"] },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", label: "Groq", reasoningEffort: "low", fallbacks: ["openai/gpt-oss-20b"], requestTokens: 7500, keyEnv: "GROQ_API_KEY" },
  // Fastest (wafer-scale). Free trial credit; pick any model in their catalog.
  cerebras: { baseUrl: "https://api.cerebras.ai/v1", model: "gpt-oss-120b", label: "Cerebras", reasoningEffort: "low" },
  // Free "Experiment" plan (may train on data). Small = fast, tool calling, multilingual.
  mistral: { baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest", label: "Mistral" },
  // Free with a GitHub account (fine-grained token with "Models: read"). Small per-request limits.
  github: { baseUrl: "https://models.github.ai/inference", model: "openai/gpt-4.1-mini", label: "GitHub Models", requestTokens: 8000 },
  // OpenRouter has no safe default: set LLM_MODEL to a model id ending in ":free".
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "", label: "OpenRouter" },

  // Sarvam AI Indian LLM provider
  sarvam: { baseUrl: "https://api.sarvam.ai/v1", model: "sarvam-2b", label: "Sarvam AI", reasoningEffort: "low", fallbacks: ["sarvam-2b-flash"], keyEnv: "SARVAM_API_KEY" },
};

function raw(): string {
  return (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
}
function preset() {
  return PRESETS[raw()] ?? null;
}

export function llmProvider(): Provider {
  const p = raw();
  if (PRESETS[p] || p === "openai-compatible") return "openai";
  return "anthropic";
}

/** One endpoint + model to try. The adapter walks a chain of these until one answers. */
export type LlmTarget = {
  /** Preset name ("openai", "groq"…) or "custom". */
  provider: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Sent as reasoning_effort when not null. */
  reasoningEffort: string | null;
  /** OpenAI's own API wants max_completion_tokens; most compatible APIs still take max_tokens. */
  tokenParam: "max_tokens" | "max_completion_tokens";
  /** True for the fallback provider (a different endpoint and key). */
  crossProvider: boolean;
};

function tokenParamFor(baseUrl: string): LlmTarget["tokenParam"] {
  return /^https:\/\/api\.openai\.com\//.test(`${baseUrl}/`) ? "max_completion_tokens" : "max_tokens";
}

/** off / none / false / 0 → disabled. */
function disabled(v: string): boolean {
  return ["off", "none", "false", "0", "no"].includes(v);
}

/** Normalises a reasoning-effort setting: "off" omits the parameter, "none" is sent as "none". */
function effortValue(v: string | undefined, fallback: string | null): string | null {
  const t = (v ?? "").trim().toLowerCase();
  if (t === "off") return null;
  return t || fallback;
}

export const openaiCompat = {
  baseUrl(): string {
    return (process.env.LLM_BASE_URL || preset()?.baseUrl || PRESETS.nvidia!.baseUrl).replace(/\/+$/, "");
  },
  apiKey(): string {
    // Never send another provider's key (GROQ_API_KEY…) to OpenAI.
    if (raw() === "openai") return process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || "";
    return process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY || process.env.MISTRAL_API_KEY || process.env.GITHUB_TOKEN || process.env.OPENROUTER_API_KEY || process.env.NVIDIA_API_KEY || process.env.SARVAM_API_KEY || "";
  },
  model(): string {
    const p = preset();
    return process.env.LLM_MODEL || (p ? p.model : PRESETS.nvidia!.model);
  },
  /** Tried in order when the main model is overloaded (429/5xx) or missing (404). LLM_FALLBACK_MODELS=a,b overrides. */
  fallbackModels(): string[] {
    const env = process.env.LLM_FALLBACK_MODELS;
    if (env !== undefined) return env.split(",").map((m) => m.trim()).filter(Boolean);
    return preset()?.fallbacks ?? [];
  },
  /**
   * Small model for a short side task (rewriting a search query). The first fallback
   * that isn't the reply model, otherwise the reply model itself.
   */
  rewriteModel(primary: string): string {
    const small = this.fallbackModels().find((m) => m && m !== primary);
    return small || primary;
  },
  /**
   * Thinking models (Gemini 3, gpt-oss) answer faster with low effort. "off" omits the
   * parameter (the provider's default applies). "none" is sent as "none": GPT-6 Luna needs
   * it for tool calls, and it is how DeepSeek-style models turn thinking off.
   */
  reasoningEffort(): string | null {
    return effortValue(process.env.LLM_REASONING_EFFORT, preset()?.reasoningEffort ?? null);
  },
  /** Name of the fallback provider preset, or null. LLM_FALLBACK_PROVIDER overrides ("off" disables). */
  fallbackProviderName(): string | null {
    const env = process.env.LLM_FALLBACK_PROVIDER;
    const name = (env !== undefined && env.trim() !== "" ? env : preset()?.fallbackProvider ?? "").trim().toLowerCase();
    if (!name || disabled(name) || name === raw() || !PRESETS[name]) return null;
    return name;
  },
  /**
   * Key for the fallback provider: LLM_FALLBACK_API_KEY, else that provider's own variable
   * (GROQ_API_KEY), else LLM_API_KEY when it is not the key the main provider uses.
   */
  fallbackApiKey(): string {
    const name = this.fallbackProviderName();
    if (!name) return "";
    const own = PRESETS[name]!.keyEnv ? process.env[PRESETS[name]!.keyEnv!] : "";
    const generic = process.env.LLM_API_KEY && process.env.LLM_API_KEY !== this.apiKey() ? process.env.LLM_API_KEY : "";
    return process.env.LLM_FALLBACK_API_KEY || own || generic || "";
  },
  /** Fallback-provider targets, in order. Empty when none is configured or it has no key. */
  fallbackTargets(): LlmTarget[] {
    const name = this.fallbackProviderName();
    const key = this.fallbackApiKey();
    if (!name || !key) return [];
    const p = PRESETS[name]!;
    const env = process.env.LLM_FALLBACK_PROVIDER_MODELS;
    const models = env !== undefined && env.trim() !== "" ? env.split(",").map((m) => m.trim()).filter(Boolean) : [p.model, ...(p.fallbacks ?? [])].filter(Boolean);
    const effort = effortValue(process.env.LLM_FALLBACK_REASONING_EFFORT, p.reasoningEffort ?? null);
    return [...new Set(models)].map((model) => ({ provider: name, label: p.label, baseUrl: p.baseUrl, apiKey: key, model, reasoningEffort: effort, tokenParam: tokenParamFor(p.baseUrl), crossProvider: true }));
  },
  /** A target on the main provider. */
  mainTarget(model: string): LlmTarget {
    const base = this.baseUrl();
    return { provider: preset() ? raw() : "custom", label: providerLabel(), baseUrl: base, apiKey: this.apiKey(), model, reasoningEffort: this.reasoningEffort(), tokenParam: tokenParamFor(base), crossProvider: false };
  },
  /**
   * Every target in order: the requested model, the configured model, same-provider
   * fallbacks, then the fallback provider. A request for a model that belongs to the
   * fallback provider (a retry after a timeout) starts there. The main provider is
   * skipped when it has no key.
   */
  targets(requested?: string | null): LlmTarget[] {
    const cross = this.fallbackTargets();
    const crossIdx = requested ? cross.findIndex((t) => t.model === requested) : -1;
    if (crossIdx >= 0) return cross.slice(crossIdx);
    const mainModels = [...new Set([requested, this.model(), ...this.fallbackModels()].filter((m): m is string => Boolean(m)))];
    const main = this.apiKey() ? mainModels.map((m) => this.mainTarget(m)) : [];
    return [...main, ...cross];
  },
};

/** The env var that holds the active provider's key (for setup messages). */
export function llmKeyName(): string {
  if (raw() === "openai") return "OPENAI_API_KEY";
  return llmProvider() === "openai" ? "LLM_API_KEY" : "ANTHROPIC_API_KEY";
}

export function llmKeyPresent(): boolean {
  return llmProvider() === "openai" ? Boolean(openaiCompat.apiKey() || openaiCompat.fallbackApiKey()) : Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Models this deployment will call. Anything else is treated as unknown and rewritten to the default. */
export function knownModelIds(): string[] {
  const extra = (process.env.LLM_EXTRA_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  if (llmProvider() === "openai") {
    return [...new Set([openaiCompat.model(), ...openaiCompat.fallbackModels(), ...extra].filter(Boolean))];
  }
  return [...new Set([process.env.ANTHROPIC_DEFAULT_MODEL || "claude-haiku-4-5", ...extra])];
}

const loggedUnknownModels = new Set<string>();

function noteUnknownModel(requested: string, fallback: string) {
  if (loggedUnknownModels.has(requested)) return;
  loggedUnknownModels.add(requested);
  console.warn(`[llm] model "${requested}" is not a configured id for this provider; using ${fallback}`);
}

/**
 * The model id to send. Bots store a model per row (default claude-haiku-4-5); on an
 * OpenAI-compatible provider a Claude id, or any id that is not the configured model
 * or a fallback, means "use the configured default". A retired id that is still listed
 * is also recovered when the provider returns 404 (see the chat adapter).
 */
export function resolveModel(requested: string | null | undefined): string {
  const id = (requested ?? "").trim();
  if (llmProvider() === "openai") {
    const fallback = openaiCompat.model();
    if (!id || id.startsWith("claude")) return fallback;
    if (knownModelIds().includes(id)) return id;
    noteUnknownModel(id, fallback);
    return fallback;
  }
  const fallback = process.env.ANTHROPIC_DEFAULT_MODEL || "claude-haiku-4-5";
  if (!id) return fallback;
  if (id.startsWith("claude") || knownModelIds().includes(id)) return id;
  noteUnknownModel(id, fallback);
  return fallback;
}

export function providerLabel(): string {
  if (llmProvider() === "anthropic") return "Anthropic";
  const url = openaiCompat.baseUrl();
  return Object.values(PRESETS).find((p) => url === p.baseUrl)?.label ?? "OpenAI-compatible API";
}

/** The company that processes conversations, for privacy notices ("an AI model from …"). */
export function aiProcessorName(): string {
  const name = (label: string) => {
    if (label === "Google Gemini") return "Google (Gemini)";
    if (label === "GitHub Models") return "GitHub (Microsoft)";
    return label === "OpenAI-compatible API" ? "our AI provider" : label;
  };
  const main = name(providerLabel());
  // The backup provider also sees conversations when it answers, so name it too.
  const backup = llmProvider() === "openai" && openaiCompat.fallbackApiKey() ? openaiCompat.fallbackProviderName() : null;
  return backup ? `${main} (or ${name(PRESETS[backup]!.label)} as a backup)` : main;
}

/**
 * Largest request (input + output tokens) the active provider accepts, or null when it
 * is large enough not to matter. LLM_REQUEST_TOKEN_LIMIT overrides (0 = no limit).
 */
export function requestTokenLimit(): number | null {
  const raw = process.env.LLM_REQUEST_TOKEN_LIMIT;
  if (raw !== undefined && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  if (llmProvider() !== "openai") return null;
  // Keep requests small enough for the fallback provider too, or a fallback would fail on size.
  const limits = [preset()?.requestTokens, openaiCompat.fallbackTargets().length ? PRESETS[openaiCompat.fallbackProviderName()!]?.requestTokens : undefined].filter((n): n is number => typeof n === "number" && n > 0);
  return limits.length ? Math.min(...limits) : null;
}

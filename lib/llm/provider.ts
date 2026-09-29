/**
 * Which LLM backend Botly talks to.
 *
 *   LLM_PROVIDER=anthropic (default)  → Anthropic Messages API (ANTHROPIC_API_KEY)
 *   LLM_PROVIDER=gemini | groq | cerebras | mistral | github | openrouter | nvidia | openai
 *                                     → any OpenAI-compatible Chat Completions API
 *                                        (LLM_API_KEY, optional LLM_MODEL / LLM_BASE_URL)
 *
 * The named presets pre-fill the base URL and a default model with tool calling.
 */
export type Provider = "anthropic" | "openai";

/**
 * Presets for OpenAI-compatible providers with a free tier. LLM_BASE_URL / LLM_MODEL
 * override them. Model ids change: confirm the current id in the provider's console.
 */
/** requestTokens = the most one request may carry (input + output) on that provider's free tier. */
const PRESETS: Record<string, { baseUrl: string; model: string; label: string; reasoningEffort?: string; fallbacks?: string[]; requestTokens?: number }> = {
  // Small-active-parameter MoE: fast on the shared free queue, strong multilingual (Tamil/Hindi), tool calling.
  nvidia: { baseUrl: "https://integrate.api.nvidia.com/v1", model: "qwen/qwen3-next-80b-a3b-instruct", label: "NVIDIA" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.5-flash", label: "Google Gemini", reasoningEffort: "low", fallbacks: ["gemini-3.5-flash-lite", "gemini-3.8-flash"] },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", label: "Groq", reasoningEffort: "low", fallbacks: ["openai/gpt-oss-20b"], requestTokens: 7500 },
  // Fastest (wafer-scale). Free trial credit; pick any model in their catalog.
  cerebras: { baseUrl: "https://api.cerebras.ai/v1", model: "gpt-oss-120b", label: "Cerebras", reasoningEffort: "low" },
  // Free "Experiment" plan (may train on data). Small = fast, tool calling, multilingual.
  mistral: { baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest", label: "Mistral" },
  // Free with a GitHub account (fine-grained token with "Models: read"). Small per-request limits.
  github: { baseUrl: "https://models.github.ai/inference", model: "openai/gpt-4.1-mini", label: "GitHub Models", requestTokens: 8000 },
  // OpenRouter has no safe default: set LLM_MODEL to a model id ending in ":free".
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "", label: "OpenRouter" },
};

function raw(): string {
  return (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
}
function preset() {
  return PRESETS[raw()] ?? null;
}

export function llmProvider(): Provider {
  const p = raw();
  if (PRESETS[p] || p === "openai" || p === "openai-compatible") return "openai";
  return "anthropic";
}

export const openaiCompat = {
  baseUrl(): string {
    return (process.env.LLM_BASE_URL || preset()?.baseUrl || PRESETS.nvidia!.baseUrl).replace(/\/+$/, "");
  },
  apiKey(): string {
    return process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY || process.env.MISTRAL_API_KEY || process.env.GITHUB_TOKEN || process.env.OPENROUTER_API_KEY || process.env.NVIDIA_API_KEY || "";
  },
  model(): string {
    const p = preset();
    return process.env.LLM_MODEL || (p ? p.model : PRESETS.nvidia!.model);
  },
  /** Tried in order when the main model is overloaded (503/429). LLM_FALLBACK_MODELS=a,b overrides. */
  fallbackModels(): string[] {
    const env = process.env.LLM_FALLBACK_MODELS;
    if (env !== undefined) return env.split(",").map((m) => m.trim()).filter(Boolean);
    return preset()?.fallbacks ?? [];
  },
  /** Thinking models (Gemini 3, gpt-oss) answer faster with low effort. "off" disables. */
  reasoningEffort(): string | null {
    const v = (process.env.LLM_REASONING_EFFORT ?? "").trim().toLowerCase();
    if (v === "off" || v === "none") return null;
    return v || preset()?.reasoningEffort || null;
  },
};

/** The env var that holds the active provider's key (for setup messages). */
export function llmKeyName(): string {
  return llmProvider() === "openai" ? "LLM_API_KEY" : "ANTHROPIC_API_KEY";
}

export function llmKeyPresent(): boolean {
  return llmProvider() === "openai" ? Boolean(openaiCompat.apiKey()) : Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * The model id to send. Bots store a model per row (default claude-haiku-4-5); on an
 * OpenAI-compatible provider a Claude id means "use the configured default".
 */
export function resolveModel(requested: string | null | undefined): string {
  if (llmProvider() === "openai") {
    return !requested || requested.startsWith("claude") ? openaiCompat.model() : requested;
  }
  return requested || process.env.ANTHROPIC_DEFAULT_MODEL || "claude-haiku-4-5";
}

export function providerLabel(): string {
  if (llmProvider() === "anthropic") return "Anthropic";
  const url = openaiCompat.baseUrl();
  return Object.values(PRESETS).find((p) => url === p.baseUrl)?.label ?? "OpenAI-compatible API";
}

/** The company that processes conversations, for privacy notices ("an AI model from …"). */
export function aiProcessorName(): string {
  const label = providerLabel();
  if (label === "Google Gemini") return "Google (Gemini)";
  if (label === "GitHub Models") return "GitHub (Microsoft)";
  return label === "OpenAI-compatible API" ? "our AI provider" : label;
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
  return llmProvider() === "openai" ? (preset()?.requestTokens ?? null) : null;
}

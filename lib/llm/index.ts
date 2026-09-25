import { AnthropicLlm } from "./anthropic";
import { ScriptedLlm } from "./scripted";
import type { LlmClient } from "./types";

let llm: LlmClient | null = null;

export function getLlm(): LlmClient {
  if (llm) return llm;
  llm = process.env.BOTLY_TEST_SCRIPTED_LLM === "1" && !process.env.VERCEL ? new ScriptedLlm() : new AnthropicLlm();
  return llm;
}

import type { Usage } from "../cost";

export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
export type SystemBlock = { text: string; cache?: boolean };

export type TextPart = { type: "text"; text: string };
export type ToolUsePart = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type ToolResultPart = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type LlmMessage =
  | { role: "user"; content: string | (TextPart | ToolResultPart)[] }
  | { role: "assistant"; content: string | (TextPart | ToolUsePart)[] };

export type LlmRequest = {
  model: string;
  system: SystemBlock[];
  messages: LlmMessage[];
  tools: ToolDef[];
  maxTokens: number;
  signal?: AbortSignal;
};

export type LlmTurn = {
  content: (TextPart | ToolUsePart)[];
  stopReason: string | null;
  usage: Usage;
  /** ms from request start to the first text delta, or null if no text. */
  firstTokenMs: number | null;
};

/** One streamed model call. Text deltas are pushed through onText as they arrive. */
export interface LlmClient {
  stream(req: LlmRequest, onText: (text: string) => void): Promise<LlmTurn>;
}

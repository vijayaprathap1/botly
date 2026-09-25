import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmRequest, LlmTurn, TextPart, ToolUsePart } from "./types";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 1 });
  return client;
}

export class AnthropicLlm implements LlmClient {
  async stream(req: LlmRequest, onText: (t: string) => void): Promise<LlmTurn> {
    const started = Date.now();
    const stream = await getClient().messages.create(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system.map((b) => ({
          type: "text" as const,
          text: b.text,
          ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
        })),
        messages: req.messages as Anthropic.MessageParam[],
        ...(req.tools.length ? { tools: req.tools as Anthropic.Tool[] } : {}),
        stream: true,
      },
      { signal: req.signal },
    );

    const blocks: (TextPart | (ToolUsePart & { json: string }))[] = [];
    let stopReason: string | null = null;
    let firstTokenMs: number | null = null;
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

    for await (const ev of stream) {
      switch (ev.type) {
        case "message_start": {
          const u = ev.message.usage;
          usage.input = u.input_tokens ?? 0;
          usage.output = u.output_tokens ?? 0;
          usage.cacheRead = u.cache_read_input_tokens ?? 0;
          usage.cacheWrite = u.cache_creation_input_tokens ?? 0;
          break;
        }
        case "content_block_start": {
          const b = ev.content_block;
          if (b.type === "text") blocks[ev.index] = { type: "text", text: "" };
          else if (b.type === "tool_use") blocks[ev.index] = { type: "tool_use", id: b.id, name: b.name, input: {}, json: "" };
          break;
        }
        case "content_block_delta": {
          const b = blocks[ev.index];
          if (ev.delta.type === "text_delta" && b?.type === "text") {
            if (firstTokenMs === null) firstTokenMs = Date.now() - started;
            b.text += ev.delta.text;
            onText(ev.delta.text);
          } else if (ev.delta.type === "input_json_delta" && b?.type === "tool_use") {
            b.json += ev.delta.partial_json;
          }
          break;
        }
        case "content_block_stop": {
          const b = blocks[ev.index];
          if (b?.type === "tool_use") {
            try {
              b.input = b.json ? (JSON.parse(b.json) as Record<string, unknown>) : {};
            } catch {
              b.input = {};
            }
          }
          break;
        }
        case "message_delta": {
          stopReason = ev.delta.stop_reason ?? stopReason;
          const u = ev.usage;
          usage.output = Math.max(usage.output, u.output_tokens ?? 0);
          if (u.input_tokens != null) usage.input = Math.max(usage.input, u.input_tokens);
          if (u.cache_read_input_tokens != null) usage.cacheRead = Math.max(usage.cacheRead, u.cache_read_input_tokens);
          if (u.cache_creation_input_tokens != null) usage.cacheWrite = Math.max(usage.cacheWrite, u.cache_creation_input_tokens);
          break;
        }
      }
    }

    return {
      content: blocks.filter(Boolean).map((b) => (b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, input: b.input } : b)),
      stopReason,
      usage,
      firstTokenMs,
    };
  }
}

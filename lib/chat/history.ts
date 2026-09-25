import type { MessageRow } from "../types";
import type { LlmMessage } from "../llm/types";

/**
 * Turns stored messages into model history: the last `turns` user/assistant
 * turns verbatim, and older turns folded into one short note (extractive,
 * no extra model call — see PLAN.md departure 3).
 */
export function buildHistory(rows: MessageRow[], turns: number): { messages: LlmMessage[]; olderNote: string | null } {
  const chat = rows.filter((r) => (r.role === "user" || r.role === "assistant") && r.content.trim());
  // Find the start index of the last `turns` user messages.
  let seenUsers = 0;
  let cut = 0;
  for (let i = chat.length - 1; i >= 0; i--) {
    if (chat[i]!.role === "user" && ++seenUsers === turns) {
      cut = i;
      break;
    }
  }
  const older = chat.slice(0, cut);
  const recent = chat.slice(cut);

  // Anthropic needs alternating roles starting with user: merge runs, drop a leading assistant.
  const messages: LlmMessage[] = [];
  for (const r of recent) {
    const prev = messages[messages.length - 1];
    if (prev && prev.role === r.role && typeof prev.content === "string") prev.content += "\n\n" + r.content;
    else if (messages.length === 0 && r.role === "assistant") continue;
    else messages.push({ role: r.role as "user" | "assistant", content: r.content });
  }

  const olderQuestions = older.filter((r) => r.role === "user").map((r) => r.content.replace(/\s+/g, " ").slice(0, 80));
  const olderNote = olderQuestions.length
    ? `Earlier in this conversation the visitor asked about: ${olderQuestions.slice(-6).map((q) => `"${q}"`).join("; ")}.`
    : null;
  return { messages, olderNote };
}

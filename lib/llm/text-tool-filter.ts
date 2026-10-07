import type { ToolUsePart } from "./types";

/**
 * Open models (Llama, gpt-oss, Qwen…) sometimes write a tool call into the reply text
 * instead of sending a structured tool call, e.g.
 *
 *   Here are our sparklers: …
 *   suggest_followups({"questions":["…"]})
 *
 * or `<|python_tag|>{"name": "report_unanswered", "parameters": {…}}`, the Harmony form
 * `<commentary to=functions.suggest_followups>{…}`, or just the bare arguments
 * `{ "questions": ["…"] }` at the end of the reply.
 *
 * This filter sits between the model's text stream and the visitor. It passes text
 * through immediately, except for the few characters that could be the start of a tool
 * call, which it holds until it can tell. Once a tool call starts, everything after it is
 * captured and turned into real tool calls at the end; nothing of it reaches the visitor.
 */
export class TextToolFilter {
  private pending = ""; // held: might be the start of a tool call
  private captured: string | null = null; // tool-call text (never shown)
  private shown = "";
  private readonly names: string[];

  constructor(toolNames: string[], private readonly emit: (text: string) => void) {
    this.names = toolNames.filter(Boolean);
  }

  push(delta: string): void {
    if (!delta) return;
    if (this.captured !== null) {
      this.captured += delta;
      return;
    }
    this.pending += delta;
    this.flush(false);
  }

  /** Call when the stream ends. Returns the visible text and any tool calls found in it. */
  end(): { text: string; toolUses: ToolUsePart[] } {
    if (this.captured === null) this.flush(true);
    if (this.captured !== null) {
      const calls = parseTextToolCalls(this.captured, this.names);
      if (calls.length) return { text: this.shown, toolUses: calls };
      // Not a tool call after all: show it, unless it is markup a reply never contains
      // (a call cut off mid-way by the token limit).
      if (!isToolMarkup(this.captured, this.names)) this.out(this.captured);
      this.captured = null;
    }
    return { text: this.shown, toolUses: [] };
  }

  private out(t: string) {
    if (!t) return;
    this.shown += t;
    this.emit(t);
  }

  private flush(final: boolean) {
    if (!this.names.length) {
      this.out(this.pending);
      this.pending = "";
      return;
    }
    const start = findToolCallStart(this.shown, this.pending, this.names);
    if (start >= 0) {
      this.out(this.pending.slice(0, start).replace(/\s+$/, (ws) => (ws.includes("\n") ? "" : ws)));
      this.captured = this.pending.slice(start);
      this.pending = "";
      return;
    }
    if (final) {
      this.out(this.pending);
      this.pending = "";
      return;
    }
    const hold = holdFrom(this.shown, this.pending, this.names);
    this.out(this.pending.slice(0, hold));
    this.pending = this.pending.slice(hold);
  }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Tools whose arguments a model sometimes writes with no tool name at all. The first
 * key of the object identifies the tool (only keys no customer-facing reply would contain).
 */
const BARE_ARGS: Record<string, string> = { questions: "suggest_followups" };
const bareKeys = (names: string[]) => Object.keys(BARE_ARGS).filter((k) => names.includes(BARE_ARGS[k]!));

/** Text that can only be a (possibly unfinished) tool call, never part of an answer. */
function isToolMarkup(text: string, names: string[]): boolean {
  const keys = bareKeys(names).map(esc).join("|");
  return new RegExp(`^(?:<\\|channel\\|>|<commentary\\b|(?:commentary\\s+)?to=functions\\.${keys ? `|(?:\`\`\`(?:json)?\\s*)?\\{\\s*"(?:${keys})"\\s*:` : ""})`).test(text);
}

/** True when position i in `full` starts a word (start of text, or after space/punctuation). */
function atBoundary(full: string, i: number): boolean {
  if (i === 0) return true;
  return /[\s.,;:!?)\]}>"'`*_-]/.test(full[i - 1]!) && !/[A-Za-z0-9_]/.test(full[i - 1]!);
}

/** Index in `pending` where a complete tool-call opener begins, or -1. */
function findToolCallStart(shown: string, pending: string, names: string[]): number {
  const full = shown + pending;
  const base = shown.length;
  const nameAlt = names.map(esc).join("|");
  const patterns = [
    new RegExp(`(?:${nameAlt})\\s*[({]`, "g"), // suggest_followups({...}) or name {...}
    /<\|python_tag\|>/g,
    /\{\s*"name"\s*:/g, // {"name": "report_unanswered", "parameters": {...}}
    /```(?:json)?\s*\n?\s*\{\s*"name"/g,
    // Harmony (gpt-oss) channel markup: <commentary to=functions.x>{…}, <|channel|>commentary to=functions.x …
    /<\|channel\|>/g,
    /<commentary\b/g,
    /(?:commentary\s+)?to=functions\./g,
    // Bare arguments with no tool name: { "questions": [ … ] } (also inside a code fence).
    ...bareKeys(names).map((k) => new RegExp("(?:```(?:json)?\\s*)?\\{\\s*\"" + k + "\"\\s*:", "g")),
  ];
  let best = -1;
  for (const re of patterns) {
    re.lastIndex = Math.max(0, base - 40);
    let m: RegExpExecArray | null;
    while ((m = re.exec(full))) {
      const i = m.index;
      if (i + m[0].length <= base) continue; // entirely in already-shown text
      if (i < base) continue; // began in shown text: too late to hide, leave it
      if (!atBoundary(full, i)) continue;
      if (best < 0 || i < best) best = i;
      break;
    }
  }
  return best < 0 ? -1 : best - base;
}

/** How much of `pending` is safe to show now; the rest might still become a tool call. */
function holdFrom(shown: string, pending: string, names: string[]): number {
  const full = shown + pending;
  const base = shown.length;
  const openers = [...names.map((n) => `${n}(`), ...names.map((n) => `${n} {`), "<|python_tag|>", '{"name"', "```", "<|channel|>", "<commentary", "commentary to=functions.", "to=functions.", ...bareKeys(names).map((k) => `{"${k}":`)];
  // Earliest position whose remaining text is a proper prefix of an opener.
  for (let i = Math.max(base, full.length - 40); i < full.length; i++) {
    const tail = full.slice(i);
    if (!atBoundary(full, i)) continue;
    const squeezed = tail.replace(/\s+/g, "");
    const fence = /^```(?:j(?:s(?:o(?:n)?)?)?)?\s*(?:\{\s*(?:"[a-z_]{0,20}"?)?)?$/.test(tail);
    if (fence || (squeezed && openers.some((o) => o.startsWith(tail) || o.replace(/\s+/g, "").startsWith(squeezed)))) {
      return i - base;
    }
  }
  return pending.length;
}

/** Reads a balanced JSON object/array starting at s[i] ('{' or '['). Returns [json, end]. */
function readJson(s: string, i: number): [string, number] | null {
  const open = s[i];
  if (open !== "{" && open !== "[") return null;
  let depth = 0;
  let inStr = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j]!;
    if (inStr) {
      if (c === "\\") j++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return [s.slice(i, j + 1), j + 1];
    }
  }
  return null;
}

const newId = () => `call_${crypto.randomUUID().slice(0, 12)}`;

function asArgs(v: unknown): Record<string, unknown> {
  if (typeof v === "string") {
    try {
      return asArgs(JSON.parse(v));
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Parses every tool call written as text: `name({...})`, `name {...}`, `{"name":…,"parameters":…}` (also in arrays / code fences). */
export function parseTextToolCalls(text: string, names: string[]): ToolUsePart[] {
  const s = text.replace(/<\|[a-z_]+\|>/gi, " ").replace(/<\/?commentary\b/gi, " ").replace(/```(?:json)?/gi, " ");
  const calls: ToolUsePart[] = [];
  const known = new Set(names);
  let i = 0;
  while (i < s.length) {
    // name( {..} ) or name {..}
    const rest = s.slice(i);
    const m = new RegExp(`^(${names.map(esc).join("|")})[\\s>]*(?:json\\b)?\\s*\\(?\\s*`).exec(rest);
    if (m) {
      const at = i + m[0].length;
      const json = readJson(s, at);
      if (json) {
        try {
          calls.push({ type: "tool_use", id: newId(), name: m[1]!, input: asArgs(JSON.parse(json[0])) });
        } catch {
          /* not JSON: skip */
        }
        i = json[1];
        continue;
      }
    }
    if (s[i] === "{" || s[i] === "[") {
      const json = readJson(s, i);
      if (json) {
        try {
          const v = JSON.parse(json[0]) as unknown;
          for (const item of Array.isArray(v) ? v : [v]) {
            const o = item as { name?: unknown; parameters?: unknown; arguments?: unknown } | null;
            if (o && typeof o.name === "string" && known.has(o.name)) calls.push({ type: "tool_use", id: newId(), name: o.name, input: asArgs(o.parameters ?? o.arguments ?? {}) });
            else if (o && typeof o === "object" && !Array.isArray(v)) {
              // Bare arguments: the first key names the tool.
              const tool = BARE_ARGS[Object.keys(o)[0] ?? ""];
              if (tool && known.has(tool)) calls.push({ type: "tool_use", id: newId(), name: tool, input: asArgs(o) });
            }
          }
        } catch {
          /* ignore */
        }
        i = json[1];
        continue;
      }
    }
    i++;
  }
  return calls;
}

/** Removes tool calls written as text from a finished message (for messages saved before the filter existed). */
export function stripTextToolCalls(text: string, names: string[]): string {
  const shown: string[] = [];
  const f = new TextToolFilter(names, (t) => shown.push(t));
  f.push(text);
  f.end();
  return shown.join("").replace(/\s+$/, "");
}

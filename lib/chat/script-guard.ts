import { detectLanguage } from "../language";
import { dominantScript } from "../reply-style";

/**
 * Runtime script check for Roman-script Hinglish/Tanglish visitors (QA launch retest
 * 2026-10-25: a Tanglish visitor got a reply in Tamil script even though the prompt said
 * "Roman letters only").
 *
 * Replies stream, so the check holds back only the start of each model turn (about
 * GATE_LETTERS letters, a few tokens). If that start is in Tamil or Devanagari script,
 * nothing of it reaches the visitor and the engine regenerates the turn ONCE with a
 * stronger instruction. A clean start is flushed at once and the rest streams as before.
 * Text after the opening can't be recalled, so a reply that switches script midway is
 * only logged, not fixed.
 */
export const GATE_LETTERS = 24;

export type RomanIndic = "hinglish" | "tanglish";

/** The visitor's Roman-script Indian language, or null when the guard doesn't apply. */
export function romanIndicVisitor(message: string): RomanIndic | null {
  const l = detectLanguage(message);
  return l === "hinglish" || l === "tanglish" ? l : null;
}

/** True when a reply for this visitor is written in Tamil or Devanagari script. */
export function wrongScript(reply: string): boolean {
  const s = dominantScript(reply);
  return s === "tamil" || s === "devanagari";
}

const letters = (t: string) => t.match(/\p{L}/gu)?.length ?? 0;

export type ScriptGate = {
  /** Use as the stream's onText. */
  onText: (t: string) => void;
  /** Call when the stream ends: flushes a short clean reply; true when the turn was rejected. */
  finish: () => boolean;
};

export function createScriptGate(write: (t: string) => void, gateLetters = GATE_LETTERS): ScriptGate {
  let state: "buffering" | "passing" | "rejected" = "buffering";
  let buf = "";
  const decide = () => {
    if (wrongScript(buf)) {
      state = "rejected";
    } else {
      state = "passing";
      if (buf) write(buf);
    }
    buf = "";
  };
  return {
    onText(t) {
      if (state === "passing") return write(t);
      if (state === "rejected") return;
      buf += t;
      if (letters(buf) >= gateLetters) decide();
    },
    finish() {
      if (state === "buffering") decide();
      return state === "rejected";
    },
  };
}

/** Added to the system context for the one regeneration. */
export function scriptRetryInstruction(visitor: RomanIndic): string {
  const [lang, script] = visitor === "tanglish" ? ["Tanglish (Tamil written in English letters)", "Tamil script"] : ["Hinglish (Hindi written in English letters)", "Devanagari"];
  return `IMPORTANT: your previous draft was written in ${script}, but the visitor writes ${lang}. Write the whole reply in Roman letters (a–z) only, in ${lang}. Do not use any ${script} characters, even if earlier messages in this chat used them.`;
}

/**
 * Follow-up suggestions ("suggest_followups") are a model TOOL CALL. The engine emits the
 * `suggestions` SSE event the moment that tool runs, which is often BEFORE the reply text
 * (the model calls the tool in its first round and writes the answer in the next) or in the
 * middle of it. Rendering on arrival made the pills show up under the typing dots or above a
 * half-streamed reply. The gate holds them until the reply has fully finished.
 */
export class FollowupGate {
  private held: string[] | null = null;
  private failed = false;

  /** A `suggestions` event arrived: keep it (the latest one wins) but don't show it yet. */
  hold(questions: unknown) {
    if (!Array.isArray(questions)) return;
    const seen = new Set<string>();
    const qs: string[] = [];
    for (const q of questions) {
      if (typeof q !== "string") continue;
      const t = q.trim().slice(0, 120);
      if (!t || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      qs.push(t);
    }
    this.held = qs.length ? qs.slice(0, 4) : null;
  }

  /** The reply errored out or was cut off: its suggestions no longer make sense. */
  fail() {
    this.failed = true;
  }

  /**
   * The stream is done. Returns the questions to show now, once, or null.
   * `replied` is false when no answer text or card arrived (nothing to follow up on).
   */
  release(replied: boolean): string[] | null {
    const out = !this.failed && replied ? this.held : null;
    this.held = null;
    return out;
  }
}

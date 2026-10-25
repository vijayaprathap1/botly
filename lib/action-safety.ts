/**
 * Client-side guard for server-action forms (QA retest 2026-10-25, item 6).
 *
 * A server action that fails in the browser (ERR_CONNECTION_CLOSED while a deploy is
 * being promoted, a stale action id after a deploy, or a hung request) used to throw into
 * the route's error boundary ("Something went wrong") or leave "Saving…" on screen forever.
 * This turns those failures into a normal `{ error }` state shown next to the Save button.
 */
export const ACTION_TIMEOUT_MS = 30_000;

export const ACTION_NETWORK_ERROR =
  "Couldn't reach Botly, so we can't confirm the save. Your changes may already be saved: refresh the page to check, then save again if needed.";
export const ACTION_STALE_ERROR = "Botly was just updated. Refresh the page and save again (what you typed is still in the form).";
export const ACTION_TIMEOUT_ERROR =
  "Still waiting for the server. Your changes may already be saved: refresh the page in a moment to check.";

/** Next.js control flow (redirect(), notFound()) must keep propagating. */
export function isNextControlFlow(e: unknown): boolean {
  const d = (e as { digest?: unknown } | null)?.digest;
  return typeof d === "string" && /^NEXT_/.test(d);
}

export function actionFailureMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/server action/i.test(msg) && /not found|was not found|failed to find/i.test(msg)) return ACTION_STALE_ERROR;
  return ACTION_NETWORK_ERROR;
}

export function withActionFallback<S, A extends unknown[]>(
  fn: (...args: A) => S | Promise<S>,
  timeoutMs = ACTION_TIMEOUT_MS,
): (...args: A) => Promise<S | { error: string }> {
  return async (...args: A) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ error: string }>((resolve) => {
      timer = setTimeout(() => resolve({ error: ACTION_TIMEOUT_ERROR }), timeoutMs);
    });
    try {
      return await Promise.race([Promise.resolve().then(() => fn(...args)), timeout]);
    } catch (e) {
      if (isNextControlFlow(e)) throw e;
      if (typeof console !== "undefined") console.warn("[botly] form action failed", e);
      return { error: actionFailureMessage(e) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

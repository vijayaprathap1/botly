/**
 * Fast local token estimate, used for the knowledge cap and the editor's counter.
 * Claude's tokenizer spends roughly 1 token per 4 Latin characters and close to
 * 1 token per character for Indic scripts, so those are weighted separately.
 * Exact counts for billing always come from the API response.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 128) ascii++;
    else other++;
  }
  return Math.ceil(ascii / 4 + other * 0.9);
}

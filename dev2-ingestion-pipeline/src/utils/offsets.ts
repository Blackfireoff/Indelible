/**
 * Utilities for computing and validating character offset spans.
 *
 * All offsets are relative to the containing text (paragraph or fullText).
 */

/**
 * Find the exact character span of `needle` within `haystack`.
 * Returns [charStart, charEnd] or null if not found.
 *
 * charEnd is the index of the character AFTER the last character of the match
 * (exclusive, following JavaScript string slice conventions).
 */
export function findExactSpan(
  haystack: string,
  needle: string
): [number, number] | null {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return null;
  return [idx, idx + needle.length];
}

/**
 * Verify that `text` at [charStart, charEnd] in `source` exactly matches `expected`.
 */
export function verifySpan(
  source: string,
  charStart: number,
  charEnd: number,
  expected: string
): boolean {
  return source.slice(charStart, charEnd) === expected;
}

/**
 * Extract a context window (preceding and following text) around a span.
 *
 * @param source - The full source text
 * @param charStart - Start of the span
 * @param charEnd - End of the span (exclusive)
 * @param windowSize - Number of characters to include before and after
 */
export function extractContextWindow(
  source: string,
  charStart: number,
  charEnd: number,
  windowSize = 200
): { precedingText: string; followingText: string } {
  const precedingText = source.slice(Math.max(0, charStart - windowSize), charStart).trim();
  const followingText = source.slice(charEnd, Math.min(source.length, charEnd + windowSize)).trim();
  return { precedingText, followingText };
}

/**
 * Compute cumulative character offsets for an ordered list of paragraphs,
 * as they appear in the fullText (joined by "\n\n").
 *
 * Returns the array of [charStart, charEnd] pairs, one per paragraph,
 * relative to the fullText string.
 */
export function computeParagraphOffsets(paragraphTexts: string[]): Array<[number, number]> {
  const offsets: Array<[number, number]> = [];
  let cursor = 0;
  for (const text of paragraphTexts) {
    const start = cursor;
    const end = cursor + text.length;
    offsets.push([start, end]);
    cursor = end + 2; // "\n\n" separator
  }
  return offsets;
}

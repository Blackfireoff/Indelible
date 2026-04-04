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
 * Find the span of `needle` in `haystack` after normalizing both strings
 * (stripping invisible Unicode chars, collapsing internal whitespace).
 *
 * Returns [charStart, charEnd] in the ORIGINAL haystack, or null if not found.
 * The offsets point to the first character of the matching region in the
 * original string (pre-normalization), which may be approximate when
 * invisible chars are present.
 */
export function findNormalizedSpan(
  haystack: string,
  needle: string
): [number, number] | null {
  const normalizeForSearch = (s: string) =>
    s
      .replace(/[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const normalHaystack = normalizeForSearch(haystack);
  const normalNeedle = normalizeForSearch(needle);

  if (!normalNeedle) return null;
  const idx = normalHaystack.indexOf(normalNeedle);
  if (idx === -1) return null;

  // Map normalized idx back to original string:
  // walk the original string, counting only non-invisible non-redundant-whitespace chars
  let origIdx = 0;
  let normCount = 0;
  const invisRe = /[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/;
  let lastWasSpace = false;

  while (origIdx < haystack.length && normCount < idx) {
    const ch = haystack[origIdx];
    if (invisRe.test(ch)) {
      origIdx++;
      continue;
    }
    const isSpace = /\s/.test(ch);
    if (isSpace) {
      if (!lastWasSpace) { normCount++; lastWasSpace = true; }
    } else {
      normCount++;
      lastWasSpace = false;
    }
    origIdx++;
  }

  const start = origIdx;
  // Find end: advance origIdx by normalNeedle.length normalized chars
  normCount = 0;
  lastWasSpace = false;
  while (origIdx < haystack.length && normCount < normalNeedle.length) {
    const ch = haystack[origIdx];
    if (invisRe.test(ch)) {
      origIdx++;
      continue;
    }
    const isSpace = /\s/.test(ch);
    if (isSpace) {
      if (!lastWasSpace) { normCount++; lastWasSpace = true; }
    } else {
      normCount++;
      lastWasSpace = false;
    }
    origIdx++;
  }

  return [start, origIdx];
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

/**
 * HTML utility functions for cleaning and normalizing text content extracted
 * from the DOM after Readability processing.
 */

/**
 * Normalize whitespace in a text string:
 * - Collapse multiple spaces/tabs into a single space
 * - Preserve paragraph-level newlines
 * - Trim leading and trailing whitespace
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")          // collapse horizontal whitespace
    .replace(/\r\n/g, "\n")            // normalize line endings
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")        // collapse 3+ newlines to 2
    .trim();
}

/**
 * Strip HTML tags from a string, returning plain text.
 * This is a best-effort regex strip for use after Readability processing –
 * do not use on untrusted arbitrary HTML as a security measure.
 */
export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/**
 * Decode common HTML entities.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    );
}

/**
 * Clean the text content of a single paragraph:
 * decode entities, strip residual tags, normalize whitespace.
 */
export function cleanParagraphText(raw: string): string {
  return normalizeWhitespace(decodeHtmlEntities(stripHtmlTags(raw)));
}

/**
 * Minimum meaningful paragraph length (characters).
 * Paragraphs shorter than this are likely nav fragments, captions, or metadata
 * and are filtered out during article extraction.
 */
export const MIN_PARAGRAPH_LENGTH = 40;

/**
 * Return true if the paragraph looks like article body content
 * (long enough and not purely numeric/symbolic boilerplate).
 */
export function isContentParagraph(text: string): boolean {
  const cleaned = text.trim();
  if (cleaned.length < MIN_PARAGRAPH_LENGTH) return false;
  // Reject paragraphs that are suspiciously short after stripping digits/punctuation
  const wordChars = cleaned.replace(/[^a-zA-Z]/g, "");
  return wordChars.length >= 20;
}

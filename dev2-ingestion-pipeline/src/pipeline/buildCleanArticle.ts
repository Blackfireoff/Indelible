import type { CleanArticle, ArticleParagraph } from "../schemas/cleanArticle.js";
import type { RawCapture } from "../schemas/rawCapture.js";
import type { ReadabilityResult } from "./extractMainArticle.js";
import { paragraphId } from "../utils/ids.js";
import { computeParagraphOffsets } from "../utils/offsets.js";

const PIPELINE_VERSION = "1.0.0";

/** Reuters-specific metadata extraction from the raw HTML DOM (JSDOM). */
function extractPublisher(result: ReadabilityResult): string | null {
  return result.siteName ?? null;
}

function extractPublishedAt(result: ReadabilityResult): string | null {
  return result.publishedTime ?? null;
}

/**
 * Assemble the clean_article.json artifact from the Readability extraction result
 * and the original raw capture metadata.
 */
export function buildCleanArticle(
  rawCapture: RawCapture,
  extracted: ReadabilityResult
): CleanArticle {
  const { attestationId, requestId, sourceUrl } = rawCapture;

  const paragraphTexts = extracted.paragraphs.map((p) => p.text);
  const offsets = computeParagraphOffsets(paragraphTexts);
  const fullText = paragraphTexts.join("\n\n");

  const paragraphs: ArticleParagraph[] = extracted.paragraphs.map((p, idx) => {
    const [charStart, charEnd] = offsets[idx];
    return {
      paragraphId: paragraphId(attestationId, idx + 1),
      order: idx + 1,
      text: p.text,
      charStart,
      charEnd,
      sourceHints: {
        tagName: p.tagName,
        cssSelector: p.cssSelector,
      },
    };
  });

  return {
    schemaVersion: "1.0",
    attestationId,
    requestId,
    sourceUrl,
    publisher: extractPublisher(extracted),
    language: extracted.lang ?? null,
    title: extracted.title ?? null,
    subtitle: null, // not reliably extractable from Readability
    publishedAt: extractPublishedAt(extracted),
    extractionMethod: {
      mainContentExtractor: extracted.extractionMethod,
      version: PIPELINE_VERSION,
    },
    paragraphs,
    fullText,
  };
}

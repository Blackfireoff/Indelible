import type { RetrievalChunk, RetrievalChunksArtifact } from "../schemas/retrievalChunks.js";
import type { CleanArticle } from "../schemas/cleanArticle.js";
import type { Statement } from "../schemas/statements.js";
import { chunkId } from "../utils/ids.js";

const CHUNKING_VERSION = "1.0.0";

/**
 * Build retrieval_chunks.json from the clean article and validated statements.
 *
 * Chunk types:
 *  - "statement": one chunk per extracted statement, optimized for "what did X say?"
 *  - "paragraph": one chunk per article paragraph, optimized for contextual verification
 */
export function buildRetrievalChunks(
  cleanArticle: CleanArticle,
  statements: Statement[]
): RetrievalChunksArtifact {
  const chunks: RetrievalChunk[] = [];

  // Statement chunks
  for (const stmt of statements) {
    const id = chunkId(cleanArticle.attestationId, "statement", stmt.statementId);
    chunks.push({
      chunkId: id,
      chunkType: "statement",
      text: stmt.content,
      statementId: stmt.statementId,
      paragraphId: stmt.sourceParagraphId,
      metadata: {
        attestationId: cleanArticle.attestationId,
        sourceUrl: cleanArticle.sourceUrl,
        speaker: stmt.speaker.name,
        speakerNormalizedId: stmt.speaker.normalizedId,
        quoteType: stmt.quoteType,
        language: cleanArticle.language,
        publisher: cleanArticle.publisher,
        title: cleanArticle.title,
      },
    });
  }

  // Paragraph chunks
  for (const para of cleanArticle.paragraphs) {
    const id = chunkId(cleanArticle.attestationId, "paragraph", para.paragraphId);
    chunks.push({
      chunkId: id,
      chunkType: "paragraph",
      text: para.text,
      statementId: null,
      paragraphId: para.paragraphId,
      metadata: {
        attestationId: cleanArticle.attestationId,
        sourceUrl: cleanArticle.sourceUrl,
        speaker: null,
        speakerNormalizedId: null,
        quoteType: null,
        language: cleanArticle.language,
        publisher: cleanArticle.publisher,
        title: cleanArticle.title,
      },
    });
  }

  return {
    schemaVersion: "1.0",
    attestationId: cleanArticle.attestationId,
    sourceUrl: cleanArticle.sourceUrl,
    chunkingStrategy: {
      statementChunks: true,
      paragraphChunks: true,
      version: CHUNKING_VERSION,
    },
    chunks,
  };
}

import type { ArtifactEntry, DocumentManifest } from "../schemas/documentManifest.js";
import type { CleanArticle } from "../schemas/cleanArticle.js";
import type { RawCapture } from "../schemas/rawCapture.js";
import type { ArtifactUploadResult } from "../adapters/storage/StorageAdapter.js";
import type { UploadedAddresses } from "./uploadArtifacts.js";

const PIPELINE_VERSION = "1.0.0";

function entry(fileName: string, r: ArtifactUploadResult): ArtifactEntry {
  return {
    fileName,
    dataAddress: r.dataAddress,
    sequence: r.sequence,
    flowTxHash: r.flowTxHash,
  };
}

/**
 * Build the document_manifest.json artifact that serves as the entry point
 * for all derived artifacts produced by the Dev 2 pipeline.
 *
 * @param rawCapture     - Original raw capture from Dev 1
 * @param cleanArticle   - Processed clean article
 * @param rawArtifact    - Upload result for raw capture (or placeholder when address comes from Dev 1 only)
 * @param addresses      - Upload results for all derived artifacts
 * @param status         - Final pipeline processing status
 */
export function buildDocumentManifest(
  rawCapture: RawCapture,
  cleanArticle: CleanArticle,
  rawArtifact: ArtifactUploadResult,
  addresses: UploadedAddresses,
  status: "completed" | "failed" | "partial" = "completed",
): DocumentManifest {
  return {
    schemaVersion: "1.0",
    attestationId: rawCapture.attestationId,
    requestId: rawCapture.requestId,
    sourceUrl: rawCapture.sourceUrl,
    publisher: cleanArticle.publisher,
    language: cleanArticle.language,
    observedAt: rawCapture.observedAt,
    artifacts: {
      rawCapture: entry("raw_capture.json", rawArtifact),
      cleanArticle: entry("clean_article.json", addresses.cleanArticle),
      statements: entry("statements.json", addresses.statements),
      retrievalChunks: entry("retrieval_chunks.json", addresses.retrievalChunks),
      embeddings: entry("embeddings.json", addresses.embeddings),
    },
    processing: {
      dev2PipelineVersion: PIPELINE_VERSION,
      status,
    },
  };
}

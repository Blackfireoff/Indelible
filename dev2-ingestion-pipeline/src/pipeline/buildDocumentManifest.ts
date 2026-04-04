import type { DocumentManifest } from "../schemas/documentManifest.js";
import type { CleanArticle } from "../schemas/cleanArticle.js";
import type { RawCapture } from "../schemas/rawCapture.js";
import type { UploadedAddresses } from "./uploadArtifacts.js";

const PIPELINE_VERSION = "1.0.0";

/**
 * Build the document_manifest.json artifact that serves as the entry point
 * for all derived artifacts produced by the Dev 2 pipeline.
 *
 * @param rawCapture        - Original raw capture from Dev 1
 * @param cleanArticle      - Processed clean article
 * @param rawCaptureAddress - 0G data address of the raw capture (provided by Dev 1 or re-uploaded)
 * @param addresses         - 0G data addresses for all derived artifacts
 * @param status            - Final pipeline processing status
 */
export function buildDocumentManifest(
  rawCapture: RawCapture,
  cleanArticle: CleanArticle,
  rawCaptureAddress: string,
  addresses: UploadedAddresses,
  status: "completed" | "failed" | "partial" = "completed"
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
      rawCapture: {
        fileName: "raw_capture.json",
        dataAddress: rawCaptureAddress,
      },
      cleanArticle: {
        fileName: "clean_article.json",
        dataAddress: addresses.cleanArticle,
      },
      statements: {
        fileName: "statements.json",
        dataAddress: addresses.statements,
      },
      retrievalChunks: {
        fileName: "retrieval_chunks.json",
        dataAddress: addresses.retrievalChunks,
      },
      embeddings: {
        fileName: "embeddings.json",
        dataAddress: addresses.embeddings,
      },
    },
    processing: {
      dev2PipelineVersion: PIPELINE_VERSION,
      status,
    },
  };
}

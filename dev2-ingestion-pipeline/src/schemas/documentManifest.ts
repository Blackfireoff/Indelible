export type ProcessingStatus = "completed" | "failed" | "partial";

export interface ArtifactEntry {
  fileName: string;
  /** Merkle root returned by the storage SDK (identifies content on 0G). */
  dataAddress: string;
  /**
   * Storage-layer sequence: Flow `submissionIndex` (`Submit` event) and/or storage node `tx.seq`.
   * Null when unknown (e.g. mock adapter or pre-existing raw capture address only).
   */
  sequence: number | null;
  /** L1 transaction hash of the Flow submission when this artifact was uploaded in this run. */
  flowTxHash: string | null;
}

export interface ManifestArtifacts {
  rawCapture: ArtifactEntry;
  cleanArticle: ArtifactEntry;
  statements: ArtifactEntry;
  retrievalChunks: ArtifactEntry;
  embeddings: ArtifactEntry;
}

export interface PipelineProcessing {
  dev2PipelineVersion: string;
  status: ProcessingStatus;
}

export interface DocumentManifest {
  schemaVersion: "1.0";
  attestationId: string;
  requestId: string;
  sourceUrl: string;
  publisher: string | null;
  language: string | null;
  observedAt: string;
  artifacts: ManifestArtifacts;
  processing: PipelineProcessing;
}

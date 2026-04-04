export type ProcessingStatus = "completed" | "failed" | "partial";

export interface ArtifactEntry {
  fileName: string;
  dataAddress: string;
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

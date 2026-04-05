import type { ChunkType } from "./retrievalChunks.js";

export interface EmbeddingModel {
  provider: string;
  model: string;
  dimension: number;
  version: string;
}

export interface VectorMetadata {
  statementId: string | null;
  paragraphId: string | null;
  speakerNormalizedId: string | null;
  attestationId: string;
}

export interface EmbeddingVector {
  chunkId: string;
  chunkType: ChunkType;
  vector: number[];
  metadata: VectorMetadata;
}

export interface EmbeddingsArtifact {
  schemaVersion: "1.0";
  attestationId: string;
  embeddingModel: EmbeddingModel;
  vectors: EmbeddingVector[];
}

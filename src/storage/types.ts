/**
 * Type definitions for 0G Storage entities.
 * These match the data contracts from Dev 2.
 */

export type ChunkType = "statement" | "paragraph" | "section";

export interface Chunk {
  chunkId: string;
  documentId: string;
  seq: number;
  text: string;
  charStart: number;
  charEnd: number;
  tokenCount: number;
  sectionPath: string[];
  speaker: string | null;
  sourceUrl: string;
  observedAt: string;
  rawContentHash: string;
  canonicalTextHash: string;
  storagePointer: string;
  prevChunkId: string | null;
  nextChunkId: string | null;
  chunkType: ChunkType;
}

export interface ChunkManifest {
  chunkId: string;
  storagePointer: string;
}

// ---------------------------------------------------------------------------
// Embeddings (precomputed by Dev 2)
// ---------------------------------------------------------------------------

export interface EmbeddingModel {
  provider: string;
  model: string;
  dimension: number;
  version: string;
}

export interface EmbeddingVector {
  chunkId: string;
  chunkType: ChunkType;
  vector: number[];
  metadata: {
    statementId?: string;
    paragraphId?: string;
    speakerNormalizedId?: string;
    attestationId: string;
  };
}

export interface EmbeddingsFile {
  schemaVersion: string;
  attestationId: string;
  embeddingModel: EmbeddingModel;
  vectors: EmbeddingVector[];
}

export interface DocumentManifest {
  documentId: string;
  attestationId: string;
  title: string;
  speaker: string;
  sourceUrl: string;
  sourceType: string;
  observedAt: string;
  language: string;
  rawContentHash: string;
  canonicalTextHash: string;
  storagePointer: string;
  chunkManifestPointer: string;
  embeddingsPointer: string;
  chunks: ChunkManifest[];
}

export interface RetrievedChunk extends Chunk {
  score: number;
}

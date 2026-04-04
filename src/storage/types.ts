/**
 * Type definitions for 0G Storage entities.
 * These match the data contracts from Dev 2.
 */

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
}

export interface ChunkManifest {
  chunkId: string;
  storagePointer: string;
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
  chunks: ChunkManifest[];
}

export interface RetrievedChunk extends Chunk {
  score: number;
}

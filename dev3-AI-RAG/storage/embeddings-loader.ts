/**
 * Embeddings loader — loads precomputed vectors from 0G Storage.
 *
 * Dev 2 computes embeddings and stores them at the `embeddingsPointer` in each
 * DocumentManifest. This module provides a typed interface for loading them
 * and building a fast chunkId -> vector lookup table for retrieval.
 *
 * Usage:
 *   const loader = await EmbeddingsLoader.create(adapter, "doc-001");
 *   const vector = loader.getVector("doc-001-chunk-0002");
 */

import type { EmbeddingsFile, EmbeddingVector } from "./types";

export interface IVectorStore {
  getVector(chunkId: string): EmbeddingVector | undefined;
  getAllVectors(): EmbeddingVector[];
  getDimension(): number;
  hasChunk(chunkId: string): boolean;
}

export class EmbeddingsLoader implements IVectorStore {
  private readonly vectorsByChunkId: Map<string, EmbeddingVector>;
  private readonly dimension: number;

  private constructor(embeddings: EmbeddingsFile) {
    this.dimension = embeddings.embeddingModel.dimension;
    this.vectorsByChunkId = new Map(
      embeddings.vectors.map((v) => [v.chunkId, v])
    );
  }

  /**
   * Factory: load and index embeddings for a document via the storage adapter.
   */
  static async create(
    adapter: { getEmbeddings: (documentId: string) => Promise<EmbeddingsFile | null> },
    documentId: string
  ): Promise<EmbeddingsLoader | null> {
    const embeddings = await adapter.getEmbeddings(documentId);
    if (!embeddings) return null;
    return new EmbeddingsLoader(embeddings);
  }

  getVector(chunkId: string): EmbeddingVector | undefined {
    return this.vectorsByChunkId.get(chunkId);
  }

  getAllVectors(): EmbeddingVector[] {
    return Array.from(this.vectorsByChunkId.values());
  }

  getDimension(): number {
    return this.dimension;
  }

  hasChunk(chunkId: string): boolean {
    return this.vectorsByChunkId.has(chunkId);
  }
}

/**
 * Embeddings loader — loads precomputed vectors from local JSON files.
 *
 * Dev 2 stores embeddings as JSON files in data/embeddings/.
 * This module provides a typed interface for loading them and building
 * a fast chunkId -> vector lookup table for retrieval.
 *
 * Priority:
 * 1. Local vectors from LocalVectorStore (data/embeddings/*.json)
 * 2. Embeddings from storage adapter (downloaded from 0G Storage)
 * 3. null if not available
 *
 * Usage:
 *   const loader = await EmbeddingsLoader.create(adapter, "doc-001");
 *   const vector = loader.getVector("doc-001-chunk-0002");
 */

import type { EmbeddingsFile, EmbeddingVector } from "./types";
import { getLocalVectorStore } from "./local-vector-store";

export interface IVectorStore {
  getVector(chunkId: string): EmbeddingVector | undefined;
  getAllVectors(): EmbeddingVector[];
  getDimension(): number;
  hasChunk(chunkId: string): boolean;
}

export class EmbeddingsLoader implements IVectorStore {
  private readonly vectorsByChunkId: Map<string, EmbeddingVector>;
  private readonly dimension: number;
  private readonly source: "local" | "storage" | "generated";

  private constructor(embeddings: EmbeddingsFile, source: "local" | "storage" | "generated" = "storage") {
    this.dimension = embeddings.embeddingModel.dimension;
    this.vectorsByChunkId = new Map(
      embeddings.vectors.map((v) => [v.chunkId, v])
    );
    this.source = source;
  }

  /**
   * Factory: load and index embeddings for a document.
   *
   * Priority:
   * 1. Local vectors from LocalVectorStore (data/embeddings/*.json)
   * 2. Embeddings from storage adapter (downloaded from 0G Storage)
   * 3. null if not available
   */
  static async create(
    adapter: { getEmbeddings: (documentId: string) => Promise<EmbeddingsFile | null> },
    documentId: string
  ): Promise<EmbeddingsLoader | null> {
    // First, check if we have local vectors from LocalVectorStore
    try {
      const store = await getLocalVectorStore();
      const localVectors = store.getVectorsForDocument(documentId);
      if (localVectors.length > 0) {
        console.log(`[EmbeddingsLoader] Using ${localVectors.length} local vectors from LocalVectorStore for ${documentId}`);
        return new EmbeddingsLoader({
          schemaVersion: "1.0",
          attestationId: documentId,
          embeddingModel: {
            provider: "local",
            model: "Xenova/all-MiniLM-L6-v2",
            dimension: localVectors[0].vector.length,
            version: "1.0.0",
          },
          vectors: localVectors,
        }, "local");
      }
    } catch (error) {
      console.warn(`[EmbeddingsLoader] Failed to load from LocalVectorStore:`, error);
    }

    // Fall back to storage adapter
    const embeddings = await adapter.getEmbeddings(documentId);
    if (!embeddings) return null;
    return new EmbeddingsLoader(embeddings, "storage");
  }

  /**
   * Create from pre-loaded vectors (e.g., from event listener directly)
   */
  static fromVectors(vectors: EmbeddingVector[]): EmbeddingsLoader {
    const embeddingsFile: EmbeddingsFile = {
      schemaVersion: "1.0",
      attestationId: "local",
      embeddingModel: {
        provider: "local",
        model: "Xenova/all-MiniLM-L6-v2",
        dimension: vectors[0]?.vector.length ?? 384,
        version: "1.0.0",
      },
      vectors,
    };
    return new EmbeddingsLoader(embeddingsFile, "local");
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

  getSource(): "local" | "storage" | "generated" {
    return this.source;
  }
}

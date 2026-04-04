/**
 * Local Vector Store - Loads pre-stored embeddings from local JSON files.
 *
 * Dev 2 stores embeddings as JSON files in data/ directory.
 * This module provides a simple interface to load and query them.
 *
 * Directory structure:
 *   data/
 *     embeddings/
 *       doc-001.json    ← EmbeddingsFile format
 *       doc-002.json
 *       ...
 *
 * Usage:
 *   const store = await LocalVectorStore.create("data/embeddings");
 *   const topChunks = await store.searchBySimilarity(queryEmbedding, 5);
 *   const docIds = [...new Set(topChunks.map(c => c.documentId))];
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";
import type { EmbeddingsFile, EmbeddingVector } from "./types";
import { EmbeddingsLoader } from "./embeddings-loader";

export interface ScoredChunk {
  chunkId: string;
  documentId: string;
  vector: number[];
  score: number;
}

export interface LocalVectorStoreConfig {
  /** Directory containing embeddings JSON files */
  embeddingsDir?: string;
  /** File pattern to match (default: *.json) */
  pattern?: string;
}

export class LocalVectorStore {
  private readonly embeddingsDir: string;
  private readonly loadersByDocumentId: Map<string, EmbeddingsLoader>;
  private readonly allVectors: Map<string, EmbeddingVector>;
  private readonly chunkToDocument: Map<string, string>;

  private constructor(embeddingsDir: string) {
    this.embeddingsDir = embeddingsDir;
    this.loadersByDocumentId = new Map();
    this.allVectors = new Map();
    this.chunkToDocument = new Map();
  }

  /**
   * Factory: create and initialize the store by loading all embeddings files.
   */
  static async create(config: LocalVectorStoreConfig = {}): Promise<LocalVectorStore> {
    const embeddingsDir = config.embeddingsDir ?? "data/embeddings";
    const store = new LocalVectorStore(embeddingsDir);
    await store.loadAll();
    return store;
  }

  /**
   * Load all embeddings files from the directory.
   */
  private async loadAll(): Promise<void> {
    if (!existsSync(this.embeddingsDir)) {
      console.log(`[LocalVectorStore] Directory does not exist: ${this.embeddingsDir}`);
      console.log(`[LocalVectorStore] No embeddings loaded. Place JSON files in this directory.`);
      return;
    }

    const files = readdirSync(this.embeddingsDir).filter(f => f.endsWith(".json"));
    console.log(`[LocalVectorStore] Found ${files.length} embeddings files`);

    for (const file of files) {
      await this.loadFile(file);
    }

    console.log(`[LocalVectorStore] Loaded ${this.allVectors.size} total vectors for ${this.loadersByDocumentId.size} documents`);
  }

  /**
   * Load a single embeddings file.
   */
  private async loadFile(filename: string): Promise<void> {
    const filePath = join(this.embeddingsDir, filename);

    try {
      const content = readFileSync(filePath, "utf-8");
      const embeddings: EmbeddingsFile = JSON.parse(content);

      // Extract document ID from filename (without extension)
      const documentId = basename(filename, ".json");

      // Create loader and store
      const loader = EmbeddingsLoader.fromVectors(embeddings.vectors);
      this.loadersByDocumentId.set(documentId, loader);

      // Index all vectors and build chunk -> document mapping
      for (const vector of embeddings.vectors) {
        this.allVectors.set(vector.chunkId, vector);
        this.chunkToDocument.set(vector.chunkId, documentId);
      }

      console.log(`[LocalVectorStore] Loaded ${embeddings.vectors.length} vectors from ${filename}`);
    } catch (error) {
      console.warn(`[LocalVectorStore] Failed to load ${filename}:`, error);
    }
  }

  /**
   * Search all embeddings by cosine similarity to a query vector.
   * Returns top-K chunks sorted by score (descending).
   */
  searchBySimilarity(queryVector: number[], topK: number = 10): ScoredChunk[] {
    const results: ScoredChunk[] = [];

    for (const [chunkId, embedding] of this.allVectors) {
      const score = this.cosineSimilarity(queryVector, embedding.vector);
      const documentId = this.chunkToDocument.get(chunkId) ?? this.extractDocumentId(chunkId);

      results.push({
        chunkId,
        documentId,
        vector: embedding.vector,
        score,
      });
    }

    // Sort by score descending and take top-K
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Cosine similarity between two vectors.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * Extract document ID from chunk ID (e.g., "doc-001-chunk-0001" -> "doc-001")
   */
  private extractDocumentId(chunkId: string): string {
    const match = chunkId.match(/^(doc-\d+)/);
    return match ? match[1] : chunkId.split("-chunk-")[0];
  }

  /**
   * Get the embeddings loader for a specific document.
   */
  getLoader(documentId: string): EmbeddingsLoader | null {
    return this.loadersByDocumentId.get(documentId) ?? null;
  }

  /**
   * Get a specific vector by chunk ID.
   */
  getVector(chunkId: string): EmbeddingVector | undefined {
    return this.allVectors.get(chunkId);
  }

  /**
   * Check if we have a vector for a chunk.
   */
  hasVector(chunkId: string): boolean {
    return this.allVectors.has(chunkId);
  }

  /**
   * Get all vectors for a document.
   */
  getVectorsForDocument(documentId: string): EmbeddingVector[] {
    const loader = this.loadersByDocumentId.get(documentId);
    return loader?.getAllVectors() ?? [];
  }

  /**
   * Get all document IDs we have embeddings for.
   */
  getDocumentIds(): string[] {
    return Array.from(this.loadersByDocumentId.keys());
  }

  /**
   * Get total vector count.
   */
  getVectorCount(): number {
    return this.allVectors.size;
  }

  /**
   * Reload embeddings from disk (useful when new files are added).
   */
  async reload(): Promise<void> {
    this.loadersByDocumentId.clear();
    this.allVectors.clear();
    this.chunkToDocument.clear();
    await this.loadAll();
  }
}

// ---------------------------------------------------------------------------
// Default instance
// ---------------------------------------------------------------------------

let _defaultStore: LocalVectorStore | null = null;

export async function getLocalVectorStore(): Promise<LocalVectorStore> {
  if (!_defaultStore) {
    _defaultStore = await LocalVectorStore.create();
  }
  return _defaultStore;
}

export async function reloadVectorStore(): Promise<LocalVectorStore> {
  _defaultStore = await LocalVectorStore.create();
  return _defaultStore;
}

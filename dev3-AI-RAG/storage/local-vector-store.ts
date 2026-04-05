/**
 * Local Vector Store - Loads pre-stored embeddings from local JSON files.
 *
 * Dev 2 outputs artifacts in directories named by attestation ID:
 *   data/embeddings/
 *     {attestationId}/
 *       embeddings.json       ← vector data
 *       retrieval_chunks.json ← actual chunk text content
 *     ...
 *
 * Usage:
 *   const store = await LocalVectorStore.create("data/embeddings");
 *   const topChunks = await store.searchBySimilarity(queryEmbedding, 5);
 *   // topChunks contains chunkId, attestationId, text, speaker, etc.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import type { EmbeddingVector, ChunkType } from "./types";

export interface ScoredChunk {
  chunkId: string;
  attestationId: string;
  chunkType: string;
  text: string;
  speaker: string | null;
  speakerNormalizedId: string | null;
  sourceUrl: string;
  vector: number[];
  score: number;
}

export interface ChunkMetadata {
  chunkId: string;
  chunkType: string;
  text: string;
  statementId: string | null;
  paragraphId: string | null;
  speaker: string | null;
  speakerNormalizedId: string | null;
  sourceUrl: string;
  attestationId: string;
}

export interface LocalVectorStoreConfig {
  /** Directory containing embeddings JSON files */
  embeddingsDir?: string;
}

interface EmbeddingEntry {
  chunkId: string;
  chunkType: string;
  vector: number[];
}

interface EmbeddingsData {
  schemaVersion: string;
  attestationId: string;
  embeddingModel: {
    provider: string;
    model: string;
    dimension: number;
    version: string;
  };
  vectors: EmbeddingEntry[];
}

interface RetrievalChunksData {
  schemaVersion: string;
  attestationId: string;
  sourceUrl: string;
  chunkingStrategy: {
    statementChunks: boolean;
    paragraphChunks: boolean;
    version: string;
  };
  chunks: ChunkMetadata[];
}

export class LocalVectorStore {
  private readonly embeddingsDir: string;
  private readonly allVectors: Map<string, EmbeddingEntry>;
  private readonly chunkMetadata: Map<string, ChunkMetadata>;
  private readonly attestationIds: Set<string>;

  private constructor(embeddingsDir: string) {
    this.embeddingsDir = embeddingsDir;
    this.allVectors = new Map();
    this.chunkMetadata = new Map();
    this.attestationIds = new Set();
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
   * Load all embeddings from directories.
   * Each directory contains embeddings.json and retrieval_chunks.json
   */
  private async loadAll(): Promise<void> {
    if (!existsSync(this.embeddingsDir)) {
      console.log(`[LocalVectorStore] Directory does not exist: ${this.embeddingsDir}`);
      console.log(`[LocalVectorStore] No embeddings loaded. Place JSON files in this directory.`);
      return;
    }

    const entries = readdirSync(this.embeddingsDir);

    for (const entry of entries) {
      const fullPath = join(this.embeddingsDir, entry);

      // Skip files, only process directories
      if (!statSync(fullPath).isDirectory()) {
        // Legacy support: skip old doc-001.json style files
        if (entry.endsWith(".json")) {
          console.log(`[LocalVectorStore] Skipping legacy file: ${entry}`);
        }
        continue;
      }

      await this.loadDirectory(entry, fullPath);
    }

    console.log(`[LocalVectorStore] Loaded ${this.allVectors.size} vectors for ${this.attestationIds.size} documents`);
  }

  /**
   * Load embeddings and chunks from a single directory.
   */
  private async loadDirectory(dirName: string, dirPath: string): Promise<void> {
    const embeddingsPath = join(dirPath, "embeddings.json");
    const chunksPath = join(dirPath, "retrieval_chunks.json");
    const statementsPath = join(dirPath, "statements.json");

    if (!existsSync(embeddingsPath)) {
      console.warn(`[LocalVectorStore] No embeddings.json in ${dirName}`);
      return;
    }

    try {
      // Load embeddings
      const embeddingsContent = readFileSync(embeddingsPath, "utf-8");
      const embeddingsData: EmbeddingsData = JSON.parse(embeddingsContent);

      const attestationId = embeddingsData.attestationId;
      this.attestationIds.add(attestationId);

      // Index embeddings
      for (const vector of embeddingsData.vectors) {
        this.allVectors.set(vector.chunkId, vector);
      }

      // Try to load chunks for text content
      if (existsSync(chunksPath)) {
        const chunksContent = readFileSync(chunksPath, "utf-8");
        const chunksData: RetrievalChunksData = JSON.parse(chunksContent);

        // Index chunk metadata (text, speaker, etc.)
        for (const chunk of chunksData.chunks) {
          this.chunkMetadata.set(chunk.chunkId, {
            ...chunk,
            attestationId,
          });
        }
        console.log(`[LocalVectorStore] Loaded ${embeddingsData.vectors.length} vectors from ${dirName} (via retrieval_chunks.json)`);
      } else if (existsSync(statementsPath)) {
        // Fallback: load text from statements.json
        console.log(`[LocalVectorStore] No retrieval_chunks.json in ${dirName}, falling back to statements.json`);
        const statementsContent = readFileSync(statementsPath, "utf-8");
        const statementsData = JSON.parse(statementsContent);

        // Build statementId -> statement map
        const statementMap = new Map<string, { content: string; speaker: string | null; speakerNormalizedId: string | null }>();
        for (const stmt of statementsData.statements ?? []) {
          statementMap.set(stmt.statementId, {
            content: stmt.content,
            speaker: stmt.speaker?.name ?? null,
            speakerNormalizedId: stmt.speaker?.normalizedId ?? null,
          });
        }

        // Map vectors to statements via metadata.statementId
        // Also set basic metadata for ALL vectors (text may be empty for non-statement chunks)
        let loadedCount = 0;
        for (const vector of embeddingsData.vectors) {
          const statementId = vector.metadata?.statementId;
          const stmt = statementId ? statementMap.get(statementId) : null;

          this.chunkMetadata.set(vector.chunkId, {
            chunkId: vector.chunkId,
            chunkType: vector.chunkType,
            text: stmt?.content ?? "",
            statementId: statementId ?? null,
            paragraphId: null,
            speaker: stmt?.speaker ?? null,
            speakerNormalizedId: stmt?.speakerNormalizedId ?? null,
            sourceUrl: statementsData.sourceUrl ?? "",
            attestationId,
          });

          if (stmt) loadedCount++;
        }
        console.log(`[LocalVectorStore] Loaded ${loadedCount} statement vectors from ${dirName} (via statements.json fallback)`);
      } else {
        console.warn(`[LocalVectorStore] No retrieval_chunks.json or statements.json in ${dirName}, text content unavailable`);
        console.log(`[LocalVectorStore] Loaded ${embeddingsData.vectors.length} vectors from ${dirName} (no text)`);
      }
    } catch (error) {
      console.warn(`[LocalVectorStore] Failed to load ${dirName}:`, error);
    }
  }

  /**
   * Search all embeddings by cosine similarity to a query vector.
   * Returns top-K chunks sorted by score (descending).
   * Includes text content from retrieval_chunks.json.
   */
  searchBySimilarity(queryVector: number[], topK: number = 10): ScoredChunk[] {
    const results: ScoredChunk[] = [];

    for (const [chunkId, embedding] of this.allVectors) {
      const score = this.cosineSimilarity(queryVector, embedding.vector);
      const metadata = this.chunkMetadata.get(chunkId);

      results.push({
        chunkId,
        attestationId: metadata?.attestationId ?? (embedding.metadata as { attestationId?: string })?.attestationId ?? "unknown",
        chunkType: embedding.chunkType,
        text: metadata?.text ?? "",
        speaker: metadata?.speaker ?? null,
        speakerNormalizedId: metadata?.speakerNormalizedId ?? null,
        sourceUrl: metadata?.sourceUrl ?? "",
        vector: embedding.vector,
        score,
      });
    }

    // Sort by score descending and take top-K
    const topResults = results
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Log the best finds
    if (topResults.length > 0) {
      console.log(`[VectorStore] Top ${topResults.length} similarity matches:`);
      for (let i = 0; i < Math.min(topResults.length, 5); i++) {
        const r = topResults[i];
        const textPreview = r.text.length > 80 ? r.text.slice(0, 80) + "..." : r.text;
        const speakerInfo = r.speaker ? ` (${r.speaker})` : "";
        console.log(`[VectorStore]   [${i + 1}] score=${r.score.toFixed(4)} | ${r.chunkType}${speakerInfo} | "${textPreview}"`);
      }
      if (topResults.length > 5) {
        console.log(`[VectorStore]   ... and ${topResults.length - 5} more matches`);
      }
    }

    return topResults;
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
   * Get metadata for a specific chunk (includes text, speaker, etc.)
   */
  getChunkMetadata(chunkId: string): ChunkMetadata | undefined {
    return this.chunkMetadata.get(chunkId);
  }

  /**
   * Get text for a specific chunk.
   */
  getChunkText(chunkId: string): string | undefined {
    return this.chunkMetadata.get(chunkId)?.text;
  }

  /**
   * Check if we have a vector for a chunk.
   */
  hasVector(chunkId: string): boolean {
    return this.allVectors.has(chunkId);
  }

  /**
   * Get all attestation IDs we have embeddings for.
   */
  getAttestationIds(): string[] {
    return Array.from(this.attestationIds);
  }

  /**
   * Get all chunks for an attestation ID.
   */
  getChunksForAttestation(attestationId: string): ChunkMetadata[] {
    const chunks: ChunkMetadata[] = [];
    for (const metadata of this.chunkMetadata.values()) {
      if (metadata.attestationId === attestationId) {
        chunks.push(metadata);
      }
    }
    return chunks;
  }

  /**
   * Get all vectors for a document (by attestationId).
   * Used by EmbeddingsLoader for backwards compatibility.
   */
  getVectorsForDocument(attestationId: string): { chunkId: string; chunkType: ChunkType; vector: number[]; metadata: { attestationId: string } }[] {
    const vectors: { chunkId: string; chunkType: ChunkType; vector: number[]; metadata: { attestationId: string } }[] = [];
    for (const [chunkId, embedding] of this.allVectors) {
      const metadata = this.chunkMetadata.get(chunkId);
      if (metadata && metadata.attestationId === attestationId) {
        vectors.push({
          chunkId,
          chunkType: embedding.chunkType as ChunkType,
          vector: embedding.vector,
          metadata: { attestationId },
        });
      }
    }
    return vectors;
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
    this.allVectors.clear();
    this.chunkMetadata.clear();
    this.attestationIds.clear();
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

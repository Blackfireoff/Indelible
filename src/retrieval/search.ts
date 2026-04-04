/**
 * Retrieval module: cosine similarity search over chunk embeddings.
 *
 * Supports two modes:
 * 1. Precomputed vectors (production) — vectors loaded from 0G via EmbeddingsLoader,
 *    keyed by chunkId for O(1) lookup. Query is still embedded via IEmbedder.
 * 2. Live-computed vectors (dev fallback) — uses KeywordEmbedder when no vectorStore
 *    is provided, matching the original hackathon behavior.
 */

import type { Chunk, RetrievedChunk } from "../storage/types";
import type { IVectorStore } from "../storage/embeddings-loader";
import type { IEmbedder } from "./embedder";
import { getEmbedder } from "./embedder";

export interface SearchOptions {
  topK?: number;
  minScore?: number;
  /** Precomputed vector store (from EmbeddingsLoader). If provided, chunk vectors come from here. */
  vectorStore?: IVectorStore;
  /** Embedder for the query. Defaults to KeywordEmbedder. */
  embedder?: IEmbedder;
}

const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SCORE = 0.1;

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Search chunks by embedding similarity to a query.
 *
 * If `options.vectorStore` is provided, chunk vectors are loaded from the precomputed
 * store (production path via 0G). Otherwise the embedder computes them live (dev fallback).
 */
export async function searchChunks(
  query: string,
  chunks: Chunk[],
  options: SearchOptions = {}
): Promise<RetrievedChunk[]> {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const embedder = options.embedder ?? getEmbedder();

  if (chunks.length === 0) return [];

  const queryVector = await embedder.embed(query);

  let scored: RetrievedChunk[];

  if (options.vectorStore) {
    // Production path: use precomputed vectors from 0G
    scored = chunks
      .map((chunk): RetrievedChunk | null => {
        const stored = options.vectorStore!.getVector(chunk.chunkId);
        if (!stored) return null;
        const score = cosineSimilarity(queryVector, stored.vector);
        return { ...chunk, score };
      })
      .filter((r): r is RetrievedChunk => r !== null);
  } else {
    // Dev fallback: compute vectors on the fly via embedder
    const { embedChunks } = embedder as IEmbedder & { embedChunks: (chunks: Chunk[]) => Promise<Array<{ chunkId: string; vector: number[] }>> };
    const chunkEmbeddings = await embedChunks(chunks);
    scored = chunkEmbeddings.map((emb): RetrievedChunk => {
      const score = cosineSimilarity(queryVector, emb.vector);
      const chunk = chunks.find((c) => c.chunkId === emb.chunkId)!;
      return { ...chunk, score };
    });
  }

  const filtered = scored
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return filtered;
}

/**
 * Search across multiple documents by their chunks.
 */
export async function searchDocuments(
  query: string,
  documentChunks: Map<string, Chunk[]>,
  options: SearchOptions = {}
): Promise<RetrievedChunk[]> {
  const allChunks: Chunk[] = [];
  for (const chunks of documentChunks.values()) {
    allChunks.push(...chunks);
  }
  return searchChunks(query, allChunks, options);
}

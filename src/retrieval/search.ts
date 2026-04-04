/**
 * Retrieval module: cosine similarity search over chunk embeddings.
 */

import type { Chunk, RetrievedChunk } from "../storage/types";
import type { Embedding } from "./embedder";
import { getEmbedder } from "./embedder";

export interface SearchOptions {
  topK?: number;
  minScore?: number;
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
 */
export async function searchChunks(
  query: string,
  chunks: Chunk[],
  options: SearchOptions = {}
): Promise<RetrievedChunk[]> {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;

  if (chunks.length === 0) return [];

  const embedder = getEmbedder();
  const queryVector = await embedder.embed(query);
  const chunkEmbeddings = await embedder.embedChunks(chunks);

  const scored = chunkEmbeddings.map((emb): RetrievedChunk => {
    const score = cosineSimilarity(queryVector, emb.vector);
    const chunk = chunks.find((c) => c.chunkId === emb.chunkId)!;
    return { ...chunk, score };
  });

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

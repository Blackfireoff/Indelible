/**
 * Embedder for retrieval.
 * Currently uses simple TF-IDF-like keyword matching.
 * Replace with proper embeddings (OpenAI, local model, or 0G-native) for production.
 */

import type { Chunk } from "../storage/types";

export interface Embedding {
  chunkId: string;
  vector: number[];
}

export interface IEmbedder {
  embed(text: string): Promise<number[]>;
  embedChunks(chunks: Chunk[]): Promise<Embedding[]>;
}

/**
 * Simple keyword-based embedder for hackathon.
 * Uses character n-grams to create pseudo-vectors.
 * Cosine similarity computed over these vectors.
 */
export class KeywordEmbedder implements IEmbedder {
  private readonly ngramSize = 3;

  async embed(text: string): Promise<number[]> {
    return this.textToVector(text.toLowerCase());
  }

  async embedChunks(chunks: Chunk[]): Promise<Embedding[]> {
    return Promise.all(
      chunks.map(async (chunk) => ({
        chunkId: chunk.chunkId,
        vector: await this.embed(chunk.text),
      }))
    );
  }

  private textToVector(text: string): number[] {
    const ngrams = this.extractNgrams(text);
    const freq: Record<string, number> = {};
    for (const ng of ngrams) {
      freq[ng] = (freq[ng] ?? 0) + 1;
    }
    // Create a sparse vector representation (fixed size for common ngrams)
    const allNgrams = Object.keys(freq);
    const vector = new Array(1000).fill(0);
    for (let i = 0; i < allNgrams.length && i < 1000; i++) {
      vector[i] = freq[allNgrams[i]] ?? 0;
    }
    // Normalize
    const magnitude = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }
    return vector;
  }

  private extractNgrams(text: string): string[] {
    const cleaned = text.replace(/[^a-z0-9\s]/g, " ").toLowerCase();
    const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
    const ngrams: string[] = [];
    for (const word of words) {
      for (let i = 0; i <= word.length - this.ngramSize; i++) {
        ngrams.push(word.slice(i, i + this.ngramSize));
      }
    }
    return ngrams;
  }
}

let _embedder: IEmbedder | null = null;

export function setEmbedder(embedder: IEmbedder): void {
  _embedder = embedder;
}

export function getEmbedder(): IEmbedder {
  if (!_embedder) {
    _embedder = new KeywordEmbedder();
  }
  return _embedder;
}

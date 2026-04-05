/**
 * Embedder for retrieval using Transformers.js.
 * Runs sentence-transformers locally via WebAssembly - no API key needed.
 *
 * Model: Xenova/all-MiniLM-L6-v2
 * - 384 dimensions
 * - Fast (~22MB model)
 * - Semantic embeddings (understands meaning, not just keywords)
 *
 * This must match the model used by Dev 2 for pre-computing chunk embeddings.
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

// Model identifier - must match what Dev 2 uses
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

type FeatureExtractionPipeline = Awaited<ReturnType<typeof import("@xenova/transformers").pipeline>>;

/**
 * Production-grade embedder using Transformers.js.
 * Caches the model pipeline for reuse across calls.
 */
export class TransformersEmbedder implements IEmbedder {
  private pipeline: FeatureExtractionPipeline | null = null;
  private initPromise: Promise<FeatureExtractionPipeline> | null = null;

  /**
   * Get or initialize the Transformers.js pipeline.
   * Thread-safe singleton initialization.
   */
  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    // Prevent concurrent initialization
    if (this.initPromise) {
      return this.initPromise;
    }

    // Dynamic import to avoid WASM initialization during build
    const { pipeline } = await import("@xenova/transformers");

    this.initPromise = pipeline(
      "feature-extraction",
      MODEL_NAME
    ).then((p) => {
      this.pipeline = p;
      return p;
    });

    return this.initPromise;
  }

  /**
   * Embed a single text into a vector.
   * @param text - Text to embed
   * @returns Normalized embedding vector (384 dimensions)
   */
  async embed(text: string): Promise<number[]> {
    const p = await this.getPipeline();
    const output = await p(text, {
      pooling: "mean",
      normalize: true as const,
    });
    return Array.from(output.data);
  }

  /**
   * Embed multiple chunks in batch for efficiency.
   * @param chunks - Array of chunks to embed
   * @returns Array of embeddings with chunkId
   */
  async embedChunks(chunks: Chunk[]): Promise<Embedding[]> {
    if (chunks.length === 0) return [];

    // Batch embed all texts at once for efficiency
    const texts = chunks.map((c) => c.text);
    const p = await this.getPipeline();

    const output = await p(texts, {
      pooling: "mean",
      normalize: true as const,
    });

    return chunks.map((chunk, i) => ({
      chunkId: chunk.chunkId,
      vector: Array.from(output[i].data),
    }));
  }
}

let _embedder: IEmbedder | null = null;

export function setEmbedder(embedder: IEmbedder): void {
  _embedder = embedder;
}

export function getEmbedder(): IEmbedder {
  if (!_embedder) {
    _embedder = new TransformersEmbedder();
  }
  return _embedder;
}

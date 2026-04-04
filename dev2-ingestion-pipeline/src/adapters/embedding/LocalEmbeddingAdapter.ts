/**
 * LocalEmbeddingAdapter – generates embeddings entirely on-device using
 * Transformers.js (@xenova/transformers).
 *
 * No API key, no network call, no Python. The model is downloaded from
 * HuggingFace on first use and cached in ~/.cache/huggingface/hub/
 * (or the path set by HF_HOME env var).
 *
 * Default model: Xenova/all-MiniLM-L6-v2  (384 dimensions, ~23 MB, fast)
 * Good alternatives:
 *   - Xenova/bge-small-en-v1.5            (384 dims, better retrieval quality)
 *   - Xenova/bge-base-en-v1.5             (768 dims, higher quality, slower)
 *   - Xenova/gte-small                    (384 dims, strong on short texts)
 *   - Xenova/multilingual-e5-small        (384 dims, multilingual)
 */

import type { EmbeddingVector, EmbeddingModel } from "../../schemas/embeddings.js";
import type { RetrievalChunk } from "../../schemas/retrievalChunks.js";

export const LOCAL_EMBEDDING_DEFAULTS = {
  model: "Xenova/all-MiniLM-L6-v2",
  dimension: 384 as number,
  batchSize: 32,
};

type FeatureExtractionPipeline = (
  texts: string | string[],
  options?: { pooling?: string; normalize?: boolean }
) => Promise<{ tolist(): number[][] }>;

let _pipeline: FeatureExtractionPipeline | null = null;
let _loadedModel: string | null = null;

/**
 * Lazy-load the Transformers.js pipeline.
 * The pipeline is cached in module scope so subsequent calls reuse it.
 */
async function getPipeline(model: string): Promise<FeatureExtractionPipeline> {
  if (_pipeline && _loadedModel === model) return _pipeline;

  console.log(`[LocalEmbedding] Loading model "${model}" (first run downloads ~20-80 MB)…`);
  const { pipeline, env } = await import("@xenova/transformers");

  // Allow remote model downloads (default), use local cache when available
  env.allowRemoteModels = true;
  env.allowLocalModels = true;

  _pipeline = (await pipeline("feature-extraction", model)) as FeatureExtractionPipeline;
  _loadedModel = model;
  console.log(`[LocalEmbedding] Model ready.`);
  return _pipeline;
}

/**
 * Embed a batch of texts using the local model.
 * Returns one float32 vector per text (mean-pooled and L2-normalised).
 */
async function embedBatch(
  pipe: FeatureExtractionPipeline,
  texts: string[]
): Promise<number[][]> {
  const output = await pipe(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

export async function embedWithLocalModel(
  chunks: RetrievalChunk[],
  model: string = LOCAL_EMBEDDING_DEFAULTS.model,
  batchSize: number = LOCAL_EMBEDDING_DEFAULTS.batchSize
): Promise<{ vectors: EmbeddingVector[]; embeddingModel: EmbeddingModel }> {
  const pipe = await getPipeline(model);
  const vectors: EmbeddingVector[] = [];
  const batches = chunkArray(chunks, batchSize);
  let dimension = LOCAL_EMBEDDING_DEFAULTS.dimension;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const texts = batch.map((c) => c.text);

    process.stdout.write(
      `\r[LocalEmbedding] Batch ${i + 1}/${batches.length} (${batch.length} chunks)…`
    );

    const embeddings = await embedBatch(pipe, texts);

    embeddings.forEach((vec, idx) => {
      const chunk = batch[idx];
      dimension = vec.length;
      vectors.push({
        chunkId: chunk.chunkId,
        chunkType: chunk.chunkType,
        vector: vec,
        metadata: {
          statementId: chunk.statementId,
          paragraphId: chunk.paragraphId,
          speakerNormalizedId: chunk.metadata.speakerNormalizedId,
          attestationId: chunk.metadata.attestationId,
        },
      });
    });
  }

  process.stdout.write("\n");

  return {
    vectors,
    embeddingModel: {
      provider: "local",
      model,
      dimension,
      version: "1.0.0",
    },
  };
}

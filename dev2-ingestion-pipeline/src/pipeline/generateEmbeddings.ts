/**
 * Embedding generation for all retrieval chunks.
 *
 * Provider selection (via EMBEDDING_PROVIDER env var):
 *   "local"  → Transformers.js on-device model, no API key required (default when no OpenAI key)
 *   "openai" → OpenAI API (requires OPENAI_API_KEY)
 *   "stub"   → zero-vector stub for tests (forced when EMBEDDING_PROVIDER=stub)
 *
 * Priority order when EMBEDDING_PROVIDER is not set:
 *   1. openai  – if OPENAI_API_KEY is present
 *   2. local   – always available, no key needed
 */

import type { EmbeddingsArtifact, EmbeddingVector, EmbeddingModel } from "../schemas/embeddings.js";
import type { RetrievalChunk } from "../schemas/retrievalChunks.js";
import {
  embedWithLocalModel,
  LOCAL_EMBEDDING_DEFAULTS,
} from "../adapters/embedding/LocalEmbeddingAdapter.js";

const DEFAULT_OPENAI_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSION = 1536;
const BATCH_SIZE = 100;
const EMBEDDING_VERSION = "1.0.0";

export interface EmbeddingOptions {
  model?: string;
  batchSize?: number;
  /** Force provider: "openai" | "local" | "stub" */
  provider?: "openai" | "local" | "stub";
}

/**
 * Generate embeddings for an array of retrieval chunks.
 *
 * @param chunks - Retrieval chunks to embed
 * @param attestationId - Source attestation ID for provenance
 * @param options - Optional embedding configuration overrides
 */
export async function generateEmbeddings(
  chunks: RetrievalChunk[],
  attestationId: string,
  options: EmbeddingOptions = {}
): Promise<EmbeddingsArtifact> {
  const apiKey = process.env.OPENAI_API_KEY;
  const envProvider = process.env.EMBEDDING_PROVIDER as EmbeddingOptions["provider"] | undefined;

  const provider =
    options.provider ??
    envProvider ??
    (apiKey ? "openai" : "local");

  const batchSize = options.batchSize ?? BATCH_SIZE;

  let vectors: EmbeddingVector[];
  let embeddingModel: EmbeddingModel;

  if (provider === "openai") {
    if (!apiKey) {
      throw new Error(
        "[generateEmbeddings] EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is not set."
      );
    }
    const model = options.model ?? (process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_OPENAI_MODEL);
    const result = await embedWithOpenAI(chunks, model, batchSize, apiKey);
    vectors = result.vectors;
    embeddingModel = result.embeddingModel;

  } else if (provider === "local") {
    const model =
      options.model ??
      (process.env.LOCAL_EMBEDDING_MODEL ?? LOCAL_EMBEDDING_DEFAULTS.model);
    console.log(`[generateEmbeddings] Using local model: ${model}`);
    const result = await embedWithLocalModel(chunks, model, batchSize);
    vectors = result.vectors;
    embeddingModel = result.embeddingModel;

  } else {
    // stub
    console.warn(
      "[generateEmbeddings] Using zero-vector stub. Set EMBEDDING_PROVIDER=local for real on-device embeddings."
    );
    vectors = stubVectors(chunks, attestationId, DEFAULT_DIMENSION);
    embeddingModel = {
      provider: "stub",
      model: "zero-vector-stub",
      dimension: DEFAULT_DIMENSION,
      version: EMBEDDING_VERSION,
    };
  }

  return {
    schemaVersion: "1.0",
    attestationId,
    embeddingModel,
    vectors,
  };
}

async function embedWithOpenAI(
  chunks: RetrievalChunk[],
  model: string,
  batchSize: number,
  apiKey: string
): Promise<{ vectors: EmbeddingVector[]; embeddingModel: EmbeddingModel }> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const vectors: EmbeddingVector[] = [];
  const batches = chunkArray(chunks, batchSize);

  let dimension = DEFAULT_DIMENSION;

  for (const batch of batches) {
    const texts = batch.map((c) => c.text);
    const response = await client.embeddings.create({ model, input: texts });

    response.data.forEach((embedding, idx) => {
      const chunk = batch[idx];
      dimension = embedding.embedding.length;
      vectors.push({
        chunkId: chunk.chunkId,
        chunkType: chunk.chunkType,
        vector: embedding.embedding,
        metadata: {
          statementId: chunk.statementId,
          paragraphId: chunk.paragraphId,
          speakerNormalizedId: chunk.metadata.speakerNormalizedId,
          attestationId: chunk.metadata.attestationId,
        },
      });
    });
  }

  return {
    vectors,
    embeddingModel: {
      provider: "openai",
      model,
      dimension,
      version: EMBEDDING_VERSION,
    },
  };
}

/** Produce zero-vector stubs for testing without API access. */
function stubVectors(
  chunks: RetrievalChunk[],
  _attestationId: string,
  dimension: number
): EmbeddingVector[] {
  return chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    chunkType: chunk.chunkType,
    vector: new Array(dimension).fill(0) as number[],
    metadata: {
      statementId: chunk.statementId,
      paragraphId: chunk.paragraphId,
      speakerNormalizedId: chunk.metadata.speakerNormalizedId,
      attestationId: chunk.metadata.attestationId,
    },
  }));
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

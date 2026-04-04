/**
 * Embedding generation for all retrieval chunks.
 *
 * Primary provider: OpenAI text-embedding-3-small (1536 dimensions).
 * Fallback: deterministic zero-vector stub when no API key is configured
 *           (useful for local testing without API costs).
 *
 * Embeddings are generated in batches to respect rate limits.
 */

import type { EmbeddingsArtifact, EmbeddingVector, EmbeddingModel } from "../schemas/embeddings.js";
import type { RetrievalChunk } from "../schemas/retrievalChunks.js";

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSION = 1536;
const BATCH_SIZE = 100;
const EMBEDDING_VERSION = "1.0.0";

export interface EmbeddingOptions {
  model?: string;
  batchSize?: number;
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
  const model = options.model ?? (process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_MODEL);
  const batchSize = options.batchSize ?? BATCH_SIZE;
  const apiKey = process.env.OPENAI_API_KEY;

  let vectors: EmbeddingVector[];
  let embeddingModel: EmbeddingModel;

  if (apiKey) {
    const { vectors: v, embeddingModel: m } = await embedWithOpenAI(
      chunks,
      model,
      batchSize,
      apiKey
    );
    vectors = v;
    embeddingModel = m;
  } else {
    console.warn(
      "[generateEmbeddings] No OPENAI_API_KEY – using zero-vector stub. " +
      "Set OPENAI_API_KEY for real embeddings."
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

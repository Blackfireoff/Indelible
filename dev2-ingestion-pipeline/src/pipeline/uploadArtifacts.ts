import type { ArtifactUploadResult, StorageAdapter } from "../adapters/storage/StorageAdapter.js";
import type { CleanArticle } from "../schemas/cleanArticle.js";
import type { StatementsArtifact } from "../schemas/statements.js";
import type { RefinedStatementsArtifact } from "../schemas/refinedStatements.js";
import type { RetrievalChunksArtifact } from "../schemas/retrievalChunks.js";
import type { EmbeddingsArtifact } from "../schemas/embeddings.js";

export interface UploadedAddresses {
  cleanArticle: ArtifactUploadResult;
  statements: ArtifactUploadResult;
  refinedStatements?: ArtifactUploadResult;
  retrievalChunks: ArtifactUploadResult;
  embeddings: ArtifactUploadResult;
}

/**
 * Serialize and upload all derived artifacts to storage.
 * Returns upload results (Merkle root + storage sequence + tx hash) for the document manifest.
 *
 * Copies JSON sur disque : faites par `runIngestionJob` (archives + option `SAVE_ARTIFACTS_BEFORE_UPLOAD`).
 */
export async function uploadArtifacts(
  adapter: StorageAdapter,
  cleanArticle: CleanArticle,
  statements: StatementsArtifact,
  retrievalChunks: RetrievalChunksArtifact,
  embeddings: EmbeddingsArtifact,
  refinedStatements?: RefinedStatementsArtifact,
): Promise<UploadedAddresses> {
  const cleanJson = JSON.stringify(cleanArticle, null, 2);
  console.log("[uploadArtifacts] Uploading clean_article.json …");
  const cleanArticleAddress = await adapter.uploadArtifact("clean_article.json", cleanJson);

  const statementsJson = JSON.stringify(statements, null, 2);
  console.log("[uploadArtifacts] Uploading statements.json …");
  const statementsAddress = await adapter.uploadArtifact("statements.json", statementsJson);

  let refinedStatementsAddress: ArtifactUploadResult | undefined;
  if (refinedStatements) {
    const refinedJson = JSON.stringify(refinedStatements, null, 2);
    console.log("[uploadArtifacts] Uploading verified_statements.json …");
    refinedStatementsAddress = await adapter.uploadArtifact(
      "verified_statements.json",
      refinedJson,
    );
  }

  const chunksJson = JSON.stringify(retrievalChunks, null, 2);
  console.log("[uploadArtifacts] Uploading retrieval_chunks.json …");
  const retrievalChunksAddress = await adapter.uploadArtifact("retrieval_chunks.json", chunksJson);

  const embJson = JSON.stringify(embeddings, null, 2);
  console.log("[uploadArtifacts] Uploading embeddings.json …");
  const embeddingsAddress = await adapter.uploadArtifact("embeddings.json", embJson);

  return {
    cleanArticle: cleanArticleAddress,
    statements: statementsAddress,
    refinedStatements: refinedStatementsAddress,
    retrievalChunks: retrievalChunksAddress,
    embeddings: embeddingsAddress,
  };
}

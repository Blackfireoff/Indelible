import type { StorageAdapter } from "../adapters/storage/StorageAdapter.js";
import type { CleanArticle } from "../schemas/cleanArticle.js";
import type { StatementsArtifact } from "../schemas/statements.js";
import type { RefinedStatementsArtifact } from "../schemas/refinedStatements.js";
import type { RetrievalChunksArtifact } from "../schemas/retrievalChunks.js";
import type { EmbeddingsArtifact } from "../schemas/embeddings.js";

export interface UploadedAddresses {
  cleanArticle: string;
  statements: string;
  refinedStatements?: string;
  retrievalChunks: string;
  embeddings: string;
}

/**
 * Serialize and upload all derived artifacts to storage.
 * Returns the data addresses for inclusion in the document manifest.
 */
export async function uploadArtifacts(
  adapter: StorageAdapter,
  cleanArticle: CleanArticle,
  statements: StatementsArtifact,
  retrievalChunks: RetrievalChunksArtifact,
  embeddings: EmbeddingsArtifact,
  refinedStatements?: RefinedStatementsArtifact
): Promise<UploadedAddresses> {
  console.log("[uploadArtifacts] Uploading clean_article.json …");
  const cleanArticleAddress = await adapter.uploadArtifact(
    "clean_article.json",
    JSON.stringify(cleanArticle, null, 2)
  );

  console.log("[uploadArtifacts] Uploading statements.json …");
  const statementsAddress = await adapter.uploadArtifact(
    "statements.json",
    JSON.stringify(statements, null, 2)
  );

  let refinedStatementsAddress: string | undefined;
  if (refinedStatements) {
    console.log("[uploadArtifacts] Uploading verified_statements.json …");
    refinedStatementsAddress = await adapter.uploadArtifact(
      "verified_statements.json",
      JSON.stringify(refinedStatements, null, 2)
    );
  }

  console.log("[uploadArtifacts] Uploading retrieval_chunks.json …");
  const retrievalChunksAddress = await adapter.uploadArtifact(
    "retrieval_chunks.json",
    JSON.stringify(retrievalChunks, null, 2)
  );

  console.log("[uploadArtifacts] Uploading embeddings.json …");
  const embeddingsAddress = await adapter.uploadArtifact(
    "embeddings.json",
    JSON.stringify(embeddings, null, 2)
  );

  return {
    cleanArticle: cleanArticleAddress,
    statements: statementsAddress,
    refinedStatements: refinedStatementsAddress,
    retrievalChunks: retrievalChunksAddress,
    embeddings: embeddingsAddress,
  };
}

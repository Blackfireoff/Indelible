export type ChunkType = "statement" | "paragraph";

export interface ChunkMetadata {
  attestationId: string;
  sourceUrl: string;
  speaker: string | null;
  speakerNormalizedId: string | null;
  quoteType: string | null;
  language: string | null;
  publisher: string | null;
  title: string | null;
}

export interface RetrievalChunk {
  chunkId: string;
  chunkType: ChunkType;
  text: string;
  statementId: string | null;
  paragraphId: string | null;
  metadata: ChunkMetadata;
}

export interface ChunkingStrategy {
  statementChunks: true;
  paragraphChunks: true;
  version: string;
}

export interface RetrievalChunksArtifact {
  schemaVersion: "1.0";
  attestationId: string;
  sourceUrl: string;
  chunkingStrategy: ChunkingStrategy;
  chunks: RetrievalChunk[];
}

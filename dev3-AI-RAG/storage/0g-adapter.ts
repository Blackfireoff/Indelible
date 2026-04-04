/**
 * 0G Storage Adapter
 *
 * Interface for interacting with 0G Storage Network.
 * Uses @0glabs/0g-ts-sdk for real storage operations.
 *
 * Target network: 0G-Galileo-Testnet (chainId 16602)
 * - RPC:     https://evmrpc-testnet.0g.ai
 * - Indexer: https://indexer-storage-testnet-turbo.0g.ai
 *
 * Usage:
 *   STORAGE_ADAPTER=zerog npm run dev   ← real 0G Storage
 *   npm run dev                         ← mock data (default)
 */

import { readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import type { Chunk, DocumentManifest, EmbeddingsFile } from "./types";

export interface IStorageAdapter {
  getManifest(documentId: string): Promise<DocumentManifest | null>;
  getChunk(chunkId: string, storagePointer: string): Promise<Chunk | null>;
  listChunksForDocument(documentId: string): Promise<Chunk[]>;
  /** Load the precomputed embeddings file for a document from 0G Storage. */
  getEmbeddings(documentId: string): Promise<EmbeddingsFile | null>;
}

// ---------------------------------------------------------------------------
// Mock implementation for development
// ---------------------------------------------------------------------------

const MOCK_MANIFESTS: Record<string, DocumentManifest> = {
  "doc-001": {
    documentId: "doc-001",
    attestationId: "att-001",
    title: "Official Interview Transcript",
    speaker: "Donald Trump",
    sourceUrl: "https://example.com/interview-2026-04-04",
    sourceType: "official_webpage",
    observedAt: "2026-04-04T08:45:00Z",
    language: "en",
    rawContentHash: "0xabc123",
    canonicalTextHash: "0xdef456",
    storagePointer: "0g://documents/doc-001.json",
    chunkManifestPointer: "0g://chunks/doc-001/manifest.json",
    embeddingsPointer: "0g://embeddings/doc-001/embeddings.json",
    chunks: [
      { chunkId: "doc-001-chunk-0001", storagePointer: "0g://chunks/doc-001/chunk-0001.json" },
      { chunkId: "doc-001-chunk-0002", storagePointer: "0g://chunks/doc-001/chunk-0002.json" },
      { chunkId: "doc-001-chunk-0003", storagePointer: "0g://chunks/doc-001/chunk-0003.json" },
    ],
  },
  "doc-002": {
    documentId: "doc-002",
    attestationId: "att-002",
    title: "Trade Policy Briefing",
    speaker: "White House Press Secretary",
    sourceUrl: "https://example.com/briefing-2026-04-03",
    sourceType: "press_briefing",
    observedAt: "2026-04-03T14:00:00Z",
    language: "en",
    rawContentHash: "0x789abc",
    canonicalTextHash: "0x012def",
    storagePointer: "0g://documents/doc-002.json",
    chunkManifestPointer: "0g://chunks/doc-002/manifest.json",
    embeddingsPointer: "0g://embeddings/doc-002/embeddings.json",
    chunks: [
      { chunkId: "doc-002-chunk-0001", storagePointer: "0g://chunks/doc-002/chunk-0001.json" },
      { chunkId: "doc-002-chunk-0002", storagePointer: "0g://chunks/doc-002/chunk-0002.json" },
    ],
  },
};

const MOCK_CHUNKS: Record<string, Chunk> = {
  "doc-001-chunk-0001": {
    chunkId: "doc-001-chunk-0001",
    documentId: "doc-001",
    seq: 1,
    text: "Interviewer: Thank you for joining us today. Let's discuss the new tariff framework.",
    charStart: 0,
    charEnd: 82,
    tokenCount: 18,
    sectionPath: ["Introduction"],
    speaker: "Interviewer",
    sourceUrl: "https://example.com/interview-2026-04-04",
    observedAt: "2026-04-04T08:45:00Z",
    rawContentHash: "0xabc123",
    canonicalTextHash: "0xdef456",
    storagePointer: "0g://chunks/doc-001/chunk-0001.json",
    prevChunkId: null,
    nextChunkId: "doc-001-chunk-0002",
    chunkType: "paragraph",
  },
  "doc-001-chunk-0002": {
    chunkId: "doc-001-chunk-0002",
    documentId: "doc-001",
    seq: 2,
    text: "Trump: The tariffs are working beautifully. China is paying us billions. We have never had leverage like this before. The current tariff structure ensures American workers are protected while we renegotiate fair trade deals.",
    charStart: 83,
    charEnd: 312,
    tokenCount: 68,
    sectionPath: ["Interview", "Tariffs"],
    speaker: "Donald Trump",
    sourceUrl: "https://example.com/interview-2026-04-04",
    observedAt: "2026-04-04T08:45:00Z",
    rawContentHash: "0xabc123",
    canonicalTextHash: "0xdef456",
    storagePointer: "0g://chunks/doc-001/chunk-0002.json",
    prevChunkId: "doc-001-chunk-0001",
    nextChunkId: "doc-001-chunk-0003",
    chunkType: "statement",
  },
  "doc-001-chunk-0003": {
    chunkId: "doc-001-chunk-0003",
    documentId: "doc-001",
    seq: 3,
    text: "Interviewer: Can you elaborate on the specific tariff rates and how they compare to last year's policy?",
    charStart: 313,
    charEnd: 410,
    tokenCount: 24,
    sectionPath: ["Interview", "Tariff Rates"],
    speaker: "Interviewer",
    sourceUrl: "https://example.com/interview-2026-04-04",
    observedAt: "2026-04-04T08:45:00Z",
    rawContentHash: "0xabc123",
    canonicalTextHash: "0xdef456",
    storagePointer: "0g://chunks/doc-001/chunk-0003.json",
    prevChunkId: "doc-001-chunk-0002",
    nextChunkId: null,
    chunkType: "paragraph",
  },
  "doc-002-chunk-0001": {
    chunkId: "doc-002-chunk-0001",
    documentId: "doc-002",
    seq: 1,
    text: "Press Secretary: Our administration has imposed tariffs on Chinese goods totaling $360 billion annually. These tariffs are the largest in American history and have successfully reduced the trade deficit.",
    charStart: 0,
    charEnd: 210,
    tokenCount: 52,
    sectionPath: ["Tariffs", "Overview"],
    speaker: "White House Press Secretary",
    sourceUrl: "https://example.com/briefing-2026-04-03",
    observedAt: "2026-04-03T14:00:00Z",
    rawContentHash: "0x789abc",
    canonicalTextHash: "0x012def",
    storagePointer: "0g://chunks/doc-002/chunk-0001.json",
    prevChunkId: null,
    nextChunkId: "doc-002-chunk-0002",
    chunkType: "statement",
  },
  "doc-002-chunk-0002": {
    chunkId: "doc-002-chunk-0002",
    documentId: "doc-002",
    seq: 2,
    text: "Reporter: Have the tariffs increased prices for American consumers? Press Secretary: While some products have seen price increases, the overall economic benefits outweigh these concerns. We are monitoring the impact closely.",
    charStart: 211,
    charEnd: 425,
    tokenCount: 58,
    sectionPath: ["Tariffs", "Consumer Impact"],
    speaker: "White House Press Secretary",
    sourceUrl: "https://example.com/briefing-2026-04-03",
    observedAt: "2026-04-03T14:00:00Z",
    rawContentHash: "0x789abc",
    canonicalTextHash: "0x012def",
    storagePointer: "0g://chunks/doc-002/chunk-0002.json",
    prevChunkId: "doc-002-chunk-0001",
    nextChunkId: null,
    chunkType: "paragraph",
  },
};

const MOCK_EMBEDDINGS: Record<string, EmbeddingsFile> = {
  "doc-001": {
    schemaVersion: "1.0",
    attestationId: "att-001",
    embeddingModel: {
      provider: "example-provider",
      model: "text-embedding-model",
      dimension: 384,
      version: "1.0",
    },
    vectors: [
      {
        chunkId: "doc-001-chunk-0001",
        chunkType: "paragraph",
        vector: Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.01) * 0.3),
        metadata: { paragraphId: "p_0001", attestationId: "att-001" },
      },
      {
        chunkId: "doc-001-chunk-0002",
        chunkType: "statement",
        vector: Array.from({ length: 384 }, (_, i) => Math.cos(i * 0.02) * 0.5 + (i % 7 === 0 ? 0.4 : 0)),
        metadata: { statementId: "s_0001", speakerNormalizedId: "donald_trump", attestationId: "att-001" },
      },
      {
        chunkId: "doc-001-chunk-0003",
        chunkType: "paragraph",
        vector: Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.015) * 0.2),
        metadata: { paragraphId: "p_0002", attestationId: "att-001" },
      },
    ],
  },
  "doc-002": {
    schemaVersion: "1.0",
    attestationId: "att-002",
    embeddingModel: {
      provider: "example-provider",
      model: "text-embedding-model",
      dimension: 384,
      version: "1.0",
    },
    vectors: [
      {
        chunkId: "doc-002-chunk-0001",
        chunkType: "statement",
        vector: Array.from({ length: 384 }, (_, i) => Math.cos(i * 0.02) * 0.5 + (i % 5 === 0 ? 0.3 : 0)),
        metadata: { statementId: "s_0010", speakerNormalizedId: "white_house_press_secretary", attestationId: "att-002" },
      },
      {
        chunkId: "doc-002-chunk-0002",
        chunkType: "paragraph",
        vector: Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.01 + 1) * 0.25),
        metadata: { paragraphId: "p_0010", attestationId: "att-002" },
      },
    ],
  },
};

export class MockStorageAdapter implements IStorageAdapter {
  async getManifest(documentId: string): Promise<DocumentManifest | null> {
    return MOCK_MANIFESTS[documentId] ?? null;
  }

  async getChunk(chunkId: string, _storagePointer: string): Promise<Chunk | null> {
    return MOCK_CHUNKS[chunkId] ?? null;
  }

  async listChunksForDocument(documentId: string): Promise<Chunk[]> {
    const manifest = MOCK_MANIFESTS[documentId];
    if (!manifest) return [];

    const chunks: Chunk[] = [];
    for (const cm of manifest.chunks) {
      const chunk = await this.getChunk(cm.chunkId, cm.storagePointer);
      if (chunk) chunks.push(chunk);
    }
    return chunks;
  }

  async getEmbeddings(documentId: string): Promise<EmbeddingsFile | null> {
    return MOCK_EMBEDDINGS[documentId] ?? null;
  }
}

// ---------------------------------------------------------------------------
// 0G Storage implementation
// ---------------------------------------------------------------------------

export interface ZeroGStorageConfig {
  rpcUrl?: string;
  indexerUrl?: string;
}

export class ZeroGStorageAdapter implements IStorageAdapter {
  private readonly rpcUrl: string;
  private readonly indexerUrl: string;

  constructor(config: ZeroGStorageConfig = {}) {
    this.rpcUrl =
      config.rpcUrl ??
      process.env.ZEROG_RPC_URL ??
      "https://evmrpc-testnet.0g.ai";

    this.indexerUrl =
      config.indexerUrl ??
      process.env.ZEROG_INDEXER_URL ??
      "https://indexer-storage-testnet-turbo.0g.ai";
  }

  private parseStoragePointer(storagePointer: string): string {
    if (storagePointer.startsWith("0g://")) {
      return storagePointer.slice(5);
    }
    return storagePointer;
  }

  private async downloadFrom0G(dataAddress: string): Promise<string> {
    const { Indexer } = await import("@0glabs/0g-ts-sdk");

    const indexer = new Indexer(this.indexerUrl);
    const tmpPath = join(tmpdir(), `indelible_dl_${randomBytes(8).toString("hex")}.json`);

    try {
      const err = await indexer.download(dataAddress, tmpPath, true);
      if (err !== null) {
        throw new Error(`0G download error: ${err}`);
      }
      return readFileSync(tmpPath, "utf-8");
    } finally {
      try {
        unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
  }

  async getManifest(documentId: string): Promise<DocumentManifest | null> {
    try {
      const registryAddress = process.env.DOCUMENT_REGISTRY_ADDRESS;
      if (!registryAddress) {
        console.warn("[0G Storage] DOCUMENT_REGISTRY_ADDRESS not set");
        return null;
      }

      const registryData = await this.downloadFrom0G(registryAddress);
      const registry = JSON.parse(registryData);

      const entry = registry.documents?.[documentId];
      if (!entry) return null;

      const manifestData = await this.downloadFrom0G(entry.manifestAddress);
      return JSON.parse(manifestData) as DocumentManifest;
    } catch (err) {
      console.error(`[0G Storage] Failed to get manifest for ${documentId}:`, err);
      return null;
    }
  }

  async getChunk(chunkId: string, storagePointer: string): Promise<Chunk | null> {
    try {
      const dataAddress = this.parseStoragePointer(storagePointer);
      const chunkData = await this.downloadFrom0G(dataAddress);
      return JSON.parse(chunkData) as Chunk;
    } catch (err) {
      console.error(`[0G Storage] Failed to get chunk ${chunkId}:`, err);
      return null;
    }
  }

  async listChunksForDocument(documentId: string): Promise<Chunk[]> {
    const manifest = await this.getManifest(documentId);
    if (!manifest) return [];

    const chunks: Chunk[] = [];
    for (const cm of manifest.chunks) {
      const chunk = await this.getChunk(cm.chunkId, cm.storagePointer);
      if (chunk) chunks.push(chunk);
    }
    return chunks;
  }

  async getEmbeddings(documentId: string): Promise<EmbeddingsFile | null> {
    try {
      const manifest = await this.getManifest(documentId);
      if (!manifest || !manifest.embeddingsPointer) return null;

      const dataAddress = this.parseStoragePointer(manifest.embeddingsPointer);
      const embeddingsData = await this.downloadFrom0G(dataAddress);
      return JSON.parse(embeddingsData) as EmbeddingsFile;
    } catch (err) {
      console.error(`[0G Storage] Failed to get embeddings for ${documentId}:`, err);
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _adapter: IStorageAdapter | null = null;

export function setStorageAdapter(adapter: IStorageAdapter): void {
  _adapter = adapter;
}

export function getStorageAdapter(): IStorageAdapter {
  if (!_adapter) {
    const adapterType = process.env.STORAGE_ADAPTER ?? "mock";
    if (adapterType === "zerog") {
      _adapter = new ZeroGStorageAdapter();
      console.log("[Storage] Using ZeroGStorageAdapter");
    } else {
      _adapter = new MockStorageAdapter();
      console.log("[Storage] Using MockStorageAdapter");
    }
  }
  return _adapter;
}

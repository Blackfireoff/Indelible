/**
 * Clean Article Fetcher
 *
 * Fetches the clean article from 0G Storage using the dataAddress
 * from the local document_manifest.json.
 *
 * Usage:
 *   const fetcher = new CleanArticleFetcher();
 *   const article = await fetcher.fetchCleanArticle(attestationId);
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface CleanArticle {
  schemaVersion: string;
  attestationId: string;
  title: string;
  content: string;
  language: string;
  publisher: string | null;
  observedAt: string;
  sourceUrl: string;
  authors: string[];
  sequence: number;
  extractionMetadata: {
    rawFileHash: string;
    cleaningTimestamp: string;
    wordCount: number;
  };
}

export interface DocumentManifest {
  schemaVersion: string;
  attestationId: string;
  requestId: string;
  sourceUrl: string;
  publisher: string;
  language: string;
  observedAt: string;
  artifacts: {
    rawCapture: { fileName: string; dataAddress: string };
    cleanArticle: { fileName: string; dataAddress: string };
    statements: { fileName: string; dataAddress: string };
    retrievalChunks: { fileName: string; dataAddress: string };
    embeddings: { fileName: string; dataAddress: string };
  };
  processing: { dev2PipelineVersion: string; status: string };
}

export class CleanArticleFetcher {
  private readonly embeddingsDir: string;

  constructor(config: { embeddingsDir?: string } = {}) {
    this.embeddingsDir = config.embeddingsDir ?? "data/embeddings";
  }

  /**
   * Get the manifest for an attestation ID from local storage.
   */
  private getManifest(attestationId: string): DocumentManifest | null {
    // Find the directory that contains this attestation
    // The directories are named like: 2026-04-05_003046_{attestationId}
    const { readdirSync, statSync, readFileSync: readFile } = require("fs");

    if (!existsSync(this.embeddingsDir)) {
      console.warn(`[CleanArticleFetcher] Directory does not exist: ${this.embeddingsDir}`);
      return null;
    }

    const entries = readdirSync(this.embeddingsDir);

    for (const entry of entries) {
      const fullPath = join(this.embeddingsDir, entry);
      if (!statSync(fullPath).isDirectory()) continue;

      // Check if this directory contains our attestation
      const manifestPath = join(fullPath, "document_manifest.json");
      if (!existsSync(manifestPath)) continue;

      try {
        const manifest: DocumentManifest = JSON.parse(readFile(manifestPath, "utf-8"));
        if (manifest.attestationId === attestationId) {
          return manifest;
        }
      } catch {
        // Skip invalid manifests
      }
    }

    console.warn(`[CleanArticleFetcher] No manifest found for attestation: ${attestationId}`);
    return null;
  }

  /**
   * Fetch the clean article from 0G Storage.
   */
  async fetchCleanArticle(attestationId: string): Promise<CleanArticle | null> {
    const manifest = this.getManifest(attestationId);
    if (!manifest) {
      console.warn(`[CleanArticleFetcher] No manifest for ${attestationId}`);
      return null;
    }

    const dataAddress = manifest.artifacts.cleanArticle.dataAddress;
    console.log(`[CleanArticleFetcher] Fetching clean article from 0G: ${dataAddress.slice(0, 20)}...`);

    try {
      const { Indexer } = await import("@0glabs/0g-ts-sdk");
      const { tmpdir } = await import("os");
      const { randomBytes } = await import("crypto");
      const { join: pathJoin } = await import("path");
      const { readFileSync, unlinkSync } = await import("fs");

      const indexerUrl = process.env.ZEROG_INDEXER_URL ?? "https://indexer-storage-testnet-turbo.0g.ai";
      const indexer = new Indexer(indexerUrl);

      const tmpPath = pathJoin(tmpdir(), `indelible_clean_article_${randomBytes(8).toString("hex")}.json`);

      try {
        const err = await indexer.download(dataAddress, tmpPath, true);
        if (err !== null) {
          console.error(`[CleanArticleFetcher] 0G download error: ${err}`);
          return null;
        }

        const content = readFileSync(tmpPath, "utf-8");
        const article = JSON.parse(content) as CleanArticle;

        // Add sequence number from manifest
        article.sequence = manifest.artifacts.cleanArticle.sequence;

        return article;
      } finally {
        try {
          unlinkSync(tmpPath);
        } catch {
          // ignore cleanup errors
        }
      }
    } catch (error) {
      console.error(`[CleanArticleFetcher] Failed to fetch clean article:`, error);
      return null;
    }
  }
}

// Singleton instance
let _fetcher: CleanArticleFetcher | null = null;

export function getCleanArticleFetcher(): CleanArticleFetcher {
  if (!_fetcher) {
    _fetcher = new CleanArticleFetcher();
  }
  return _fetcher;
}

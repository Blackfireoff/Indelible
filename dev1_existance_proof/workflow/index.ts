/**
 * Indelible — Standalone Workflow Entry Point
 *
 * This script processes a URL directly:
 *   1. Fetching the raw content from the URL
 *   2. Computing a deterministic content hash
 *   3. Storing the raw artifact in 0G
 */

import { processUrl } from "./handlers/onSourceRequested";
import * as dotenv from "dotenv";
dotenv.config();

import { Mock0GStorageAdapter } from "./adapters/storage/Mock0GStorageAdapter";
import { Sdk0GStorageAdapter } from "./adapters/storage/Sdk0GStorageAdapter";
import type { StorageAdapter } from "./adapters/storage/StorageAdapter";

// ──────────────────────────────────────────────
//  Storage adapter (swap to Sdk0GStorageAdapter for production)
// ──────────────────────────────────────────────

const storageAdapter: StorageAdapter = process.env.USE_REAL_0G_STORAGE === "true" 
  ? new Sdk0GStorageAdapter({
      privateKey: process.env.PRIVATE_KEY!,
      rpcUrl: process.env.ZG_RPC_URL,
      indexerUrl: process.env.ZG_INDEXER_URL
    }) 
  : new Mock0GStorageAdapter();

// ──────────────────────────────────────────────
//  Entry point
// ──────────────────────────────────────────────

export async function main(url: string) {
  if (!url) {
    throw new Error("A URL must be provided to the workflow.");
  }

  console.log(`[Indelible Workflow] Starting process for URL: ${url}`);
  try {
    const attestation = await processUrl(url, storageAdapter);
    console.log(`[Indelible Workflow] Successfully processed!`);
    console.log(JSON.stringify(attestation, null, 2));
    return attestation;
  } catch (error) {
    console.error(`[Indelible Workflow] Error processing URL:`, error);
    throw error;
  }
}

import { fileURLToPath } from "node:url";

// If executed directly from the command line
const isMain = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('index.ts')
);

if (isMain) {
  const urlArg = process.argv[2];
  if (!urlArg) {
    console.error("Usage: npx tsx workflow/index.ts <url>");
    process.exit(1);
  }
  main(urlArg).catch((err) => {
    console.error("Workflow failed:", err);
    process.exit(1);
  });
}


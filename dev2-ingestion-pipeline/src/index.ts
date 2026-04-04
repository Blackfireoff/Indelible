/**
 * Dev 2 Ingestion Pipeline – CLI entry (one-shot)
 *
 * Usage (PowerShell):
 *   npm run pipeline
 *   $env:STORAGE_ADAPTER="zerog"; npm run pipeline
 *
 * For continuous processing of Dev1-published items, use: npm run worker
 */

import { loadDotEnv } from "./utils/loadDotEnv.js";

loadDotEnv();

import { loadRawCaptureFromFile } from "./pipeline/loadRawCapture.js";
import { loadRawCaptureForJob, runIngestionJob } from "./pipeline/runIngestionJob.js";
import { MockStorageAdapter } from "./adapters/storage/MockStorageAdapter.js";
import { ZeroGStorageAdapter } from "./adapters/storage/ZeroGStorageAdapter.js";
import type { StorageAdapter } from "./adapters/storage/StorageAdapter.js";

async function main() {
  console.log("=== Indelible Dev 2 – Ingestion Pipeline ===\n");

  const adapterType = process.env.STORAGE_ADAPTER ?? "mock";
  let adapter: StorageAdapter;

  if (adapterType === "zerog") {
    console.log("[init] Using 0G Storage adapter");
    adapter = new ZeroGStorageAdapter();
  } else {
    const outputDir = process.env.OUTPUT_DIR ?? "./output";
    console.log(`[init] Using Mock Storage adapter (output: ${outputDir})`);
    adapter = new MockStorageAdapter(outputDir);
  }

  const dataAddress = process.env.RAW_CAPTURE_DATA_ADDRESS;
  const filePath = process.env.RAW_CAPTURE_PATH ?? "./src/fixtures/sample-raw-capture.json";

  let rawCapture;
  if (dataAddress) {
    console.log(`[load] Downloading raw capture from 0G: ${dataAddress}`);
    rawCapture = await loadRawCaptureForJob(adapter, dataAddress);
  } else {
    console.log(`[load] Loading raw capture from file: ${filePath}`);
    rawCapture = await loadRawCaptureFromFile(filePath);
  }

  const skipVerify = process.env.SKIP_STORAGE_VERIFY === "true";
  const result = await runIngestionJob(
    adapter,
    { rawCapture, rawCaptureDataAddress: dataAddress },
    { skipStorageVerify: skipVerify },
  );

  console.log("\n=== Pipeline Complete ===");
  console.log(`Attestation:         ${result.rawCapture.attestationId}`);
  console.log(`Paragraphs:          ${result.summary.paragraphCount}`);
  console.log(`Statements:          ${result.summary.statementCount} (deterministic)`);
  if (result.summary.refinedStatementTotal != null) {
    console.log(
      `Refined statements:  ${result.summary.refinedStatementTotal} total, ` +
        `${result.summary.refinedVerified} verified`,
    );
  }
  console.log(`Chunks:              ${result.summary.chunkCount}`);
  console.log(`Vectors:             ${result.summary.vectorCount}`);
  console.log(`Manifest address:    ${result.manifestAddress}`);
  console.log(`clean_article:       ${result.addresses.cleanArticle}`);
  console.log(`statements:          ${result.addresses.statements}`);
  if (result.addresses.refinedStatements) {
    console.log(`verified_statements: ${result.addresses.refinedStatements}`);
  }
  console.log(`retrieval_chunks:    ${result.addresses.retrievalChunks}`);
  console.log(`embeddings:          ${result.addresses.embeddings}`);
}

main().catch((err) => {
  console.error("\n[FATAL] Pipeline failed:", err);
  process.exit(1);
});

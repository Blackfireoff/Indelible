/**
 * Dev 2 Ingestion Pipeline – Entry Point
 *
 * Usage:
 *   RAW_CAPTURE_PATH=./src/fixtures/sample-raw-capture.json npm run pipeline
 *   STORAGE_ADAPTER=zerog RAW_CAPTURE_DATA_ADDRESS=0xabc123 npm run pipeline
 */

import { loadRawCaptureFromFile, loadRawCaptureFromStorage } from "./pipeline/loadRawCapture.js";
import { extractMainArticle } from "./pipeline/extractMainArticle.js";
import { buildCleanArticle } from "./pipeline/buildCleanArticle.js";
import { extractStatements } from "./pipeline/extractStatements.js";
import { validateStatements, buildParagraphMap } from "./pipeline/validateStatements.js";
import { buildRetrievalChunks } from "./pipeline/buildRetrievalChunks.js";
import { generateEmbeddings } from "./pipeline/generateEmbeddings.js";
import { uploadArtifacts } from "./pipeline/uploadArtifacts.js";
import { buildDocumentManifest } from "./pipeline/buildDocumentManifest.js";
import { MockStorageAdapter } from "./adapters/storage/MockStorageAdapter.js";
import { ZeroGStorageAdapter } from "./adapters/storage/ZeroGStorageAdapter.js";
import type { StorageAdapter } from "./adapters/storage/StorageAdapter.js";
import type { StatementsArtifact } from "./schemas/statements.js";

async function main() {
  console.log("=== Indelible Dev 2 – Ingestion Pipeline ===\n");

  // ── 1. Select storage adapter ────────────────────────────────────────────
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

  // ── 2. Load raw capture ──────────────────────────────────────────────────
  let rawCapture;
  const dataAddress = process.env.RAW_CAPTURE_DATA_ADDRESS;
  const filePath = process.env.RAW_CAPTURE_PATH ?? "./src/fixtures/sample-raw-capture.json";

  if (dataAddress) {
    console.log(`[load] Downloading raw capture from 0G: ${dataAddress}`);
    rawCapture = await loadRawCaptureFromStorage(adapter, dataAddress);
  } else {
    console.log(`[load] Loading raw capture from file: ${filePath}`);
    rawCapture = await loadRawCaptureFromFile(filePath);
  }

  console.log(`[load] Attestation: ${rawCapture.attestationId}`);
  console.log(`[load] Source URL:   ${rawCapture.sourceUrl}\n`);

  // ── 3. Extract main article ──────────────────────────────────────────────
  console.log("[extract] Running Mozilla Readability …");
  const extracted = await extractMainArticle(rawCapture.dataBrut, rawCapture.sourceUrl);
  console.log(
    `[extract] Method: ${extracted.extractionMethod} | ` +
    `Paragraphs: ${extracted.paragraphs.length} | ` +
    `Title: "${extracted.title ?? "(none)}"}"`
  );

  // ── 4. Build clean article ───────────────────────────────────────────────
  const cleanArticle = buildCleanArticle(rawCapture, extracted);
  console.log(
    `[clean_article] ${cleanArticle.paragraphs.length} paragraphs | ` +
    `${cleanArticle.fullText.length} chars\n`
  );

  // ── 5. Extract & validate statements ────────────────────────────────────
  console.log("[statements] Extracting statements (rules + optional LLM) …");
  const useLlmFallback = !!process.env.OPENAI_API_KEY;
  const rawStatements = await extractStatements(
    cleanArticle.paragraphs,
    rawCapture.attestationId,
    { useLlmFallback }
  );

  const paragraphMap = buildParagraphMap(cleanArticle.paragraphs);
  const validatedStatements = validateStatements(rawStatements, paragraphMap);
  console.log(
    `[statements] ${rawStatements.length} extracted → ` +
    `${validatedStatements.length} validated\n`
  );

  const statementsArtifact: StatementsArtifact = {
    schemaVersion: "1.0",
    attestationId: rawCapture.attestationId,
    requestId: rawCapture.requestId,
    sourceUrl: rawCapture.sourceUrl,
    extractionPolicy: {
      allowParaphrases: false,
      preserveExactText: true,
      speakerAttributionRequired: true,
    },
    statements: validatedStatements,
  };

  // ── 6. Build retrieval chunks ────────────────────────────────────────────
  console.log("[chunks] Building retrieval chunks …");
  const retrievalChunks = buildRetrievalChunks(cleanArticle, validatedStatements);
  console.log(
    `[chunks] ${retrievalChunks.chunks.length} total chunks ` +
    `(${validatedStatements.length} statement + ${cleanArticle.paragraphs.length} paragraph)\n`
  );

  // ── 7. Generate embeddings ───────────────────────────────────────────────
  console.log("[embeddings] Generating embeddings …");
  const embeddings = await generateEmbeddings(
    retrievalChunks.chunks,
    rawCapture.attestationId
  );
  console.log(
    `[embeddings] ${embeddings.vectors.length} vectors | ` +
    `model: ${embeddings.embeddingModel.model} | ` +
    `dim: ${embeddings.embeddingModel.dimension}\n`
  );

  // ── 8. Upload all artifacts ──────────────────────────────────────────────
  console.log("[upload] Uploading artifacts to storage …");
  const addresses = await uploadArtifacts(
    adapter,
    cleanArticle,
    statementsArtifact,
    retrievalChunks,
    embeddings
  );

  // Re-upload raw capture if we loaded from file (so manifest has its address)
  const rawCaptureAddress =
    dataAddress ??
    (await adapter.uploadArtifact("raw_capture.json", JSON.stringify(rawCapture, null, 2)));

  // ── 9. Build & upload manifest ───────────────────────────────────────────
  const manifest = buildDocumentManifest(
    rawCapture,
    cleanArticle,
    rawCaptureAddress,
    addresses,
    "completed"
  );

  const manifestAddress = await adapter.uploadArtifact(
    "document_manifest.json",
    JSON.stringify(manifest, null, 2)
  );

  // ── 10. Summary ──────────────────────────────────────────────────────────
  console.log("\n=== Pipeline Complete ===");
  console.log(`Attestation:         ${rawCapture.attestationId}`);
  console.log(`Paragraphs:          ${cleanArticle.paragraphs.length}`);
  console.log(`Statements:          ${validatedStatements.length}`);
  console.log(`Chunks:              ${retrievalChunks.chunks.length}`);
  console.log(`Vectors:             ${embeddings.vectors.length}`);
  console.log(`Manifest address:    ${manifestAddress}`);
  console.log(`clean_article:       ${addresses.cleanArticle}`);
  console.log(`statements:          ${addresses.statements}`);
  console.log(`retrieval_chunks:    ${addresses.retrievalChunks}`);
  console.log(`embeddings:          ${addresses.embeddings}`);
}

main().catch((err) => {
  console.error("\n[FATAL] Pipeline failed:", err);
  process.exit(1);
});

/**
 * Dev 2 Ingestion Pipeline – Entry Point
 *
 * Usage (PowerShell):
 *   npm run pipeline                              ← uses .env
 *   $env:STORAGE_ADAPTER="zerog"; npm run pipeline  ← env var overrides .env
 */

// Load .env file before anything else.
// Environment variables set by the shell always take precedence over .env values.
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    // Shell-set variables are never overwritten
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

import { loadRawCaptureFromFile, loadRawCaptureFromStorage } from "./pipeline/loadRawCapture.js";
import { extractMainArticle } from "./pipeline/extractMainArticle.js";
import { buildCleanArticle } from "./pipeline/buildCleanArticle.js";
import { extractStatements } from "./pipeline/extractStatements.js";
import { validateStatements, buildParagraphMap } from "./pipeline/validateStatements.js";
import { runLlmRefinement } from "./pipeline/llmRefinement.js";
import { verifyRefinedStatements, deterministicStatementsToRefined } from "./pipeline/verifyRefinedStatements.js";
import { buildRetrievalChunks } from "./pipeline/buildRetrievalChunks.js";
import { generateEmbeddings } from "./pipeline/generateEmbeddings.js";
import { uploadArtifacts } from "./pipeline/uploadArtifacts.js";
import { saveArtifactLocallyIfEnabled } from "./utils/saveLocalArtifact.js";
import { buildDocumentManifest } from "./pipeline/buildDocumentManifest.js";
import { MockStorageAdapter } from "./adapters/storage/MockStorageAdapter.js";
import { ZeroGStorageAdapter } from "./adapters/storage/ZeroGStorageAdapter.js";
import type { StorageAdapter } from "./adapters/storage/StorageAdapter.js";
import type { StatementsArtifact } from "./schemas/statements.js";
import type { RefinedStatementsArtifact } from "./schemas/refinedStatements.js";

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

  // ── 5. Extract & validate statements (deterministic phase) ──────────────
  console.log("[statements] Extracting statements (deterministic rules) …");
  const rawStatements = await extractStatements(
    cleanArticle.paragraphs,
    rawCapture.attestationId,
    { useLlmFallback: false }
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

  // ── 5b. LLM refinement step (optional) ──────────────────────────────────
  const enableLlmRefinement = process.env.ENABLE_LLM_REFINEMENT === "true";
  let refinedStatementsArtifact: RefinedStatementsArtifact | undefined;

  if (enableLlmRefinement) {
    console.log("[llm-refinement] Running LLM refinement step …");
    const { statements: llmRaw, modelUsed } = await runLlmRefinement(cleanArticle);

    // Convert deterministic statements to the refined format as a baseline
    const deterministicRefined = deterministicStatementsToRefined(validatedStatements);

    let llmVerified = verifyRefinedStatements(llmRaw, cleanArticle, { keepUnverified: false });

    // Merge: deterministic always included, LLM adds new ones not already covered
    const deterministicTexts = new Set(deterministicRefined.map((s) => s.statement_text.slice(0, 80)));
    const newFromLlm = llmVerified.filter(
      (s) => !deterministicTexts.has(s.statement_text.slice(0, 80))
    );

    const allRefined = [...deterministicRefined, ...newFromLlm];
    const verifiedCount = allRefined.filter((s) => s.verified).length;

    refinedStatementsArtifact = {
      schemaVersion: "1.0",
      attestationId: rawCapture.attestationId,
      requestId: rawCapture.requestId,
      sourceUrl: rawCapture.sourceUrl,
      llm_used: llmRaw.length > 0,
      llm_model: modelUsed,
      statements: allRefined,
      extraction_summary: {
        total: allRefined.length,
        verified: verifiedCount,
        unverified: allRefined.length - verifiedCount,
      },
    };

    console.log(
      `[llm-refinement] ${allRefined.length} total statements ` +
      `(${deterministicRefined.length} deterministic + ${newFromLlm.length} new from LLM), ` +
      `${verifiedCount} verified\n`
    );
  } else {
    // Even without LLM, produce a refined statements artifact from deterministic results
    const deterministicRefined = deterministicStatementsToRefined(validatedStatements);
    refinedStatementsArtifact = {
      schemaVersion: "1.0",
      attestationId: rawCapture.attestationId,
      requestId: rawCapture.requestId,
      sourceUrl: rawCapture.sourceUrl,
      llm_used: false,
      llm_model: null,
      statements: deterministicRefined,
      extraction_summary: {
        total: deterministicRefined.length,
        verified: deterministicRefined.length,
        unverified: 0,
      },
    };
  }

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
    embeddings,
    refinedStatementsArtifact
  );

  // Re-upload raw capture if we loaded from file (so manifest has its address)
  const rawCaptureJson = JSON.stringify(rawCapture, null, 2);
  saveArtifactLocallyIfEnabled("raw_capture.json", rawCaptureJson);
  const rawCaptureAddress =
    dataAddress ??
    (await adapter.uploadArtifact("raw_capture.json", rawCaptureJson));

  // ── 9. Build & upload manifest ───────────────────────────────────────────
  const manifest = buildDocumentManifest(
    rawCapture,
    cleanArticle,
    rawCaptureAddress,
    addresses,
    "completed"
  );

  const manifestJson = JSON.stringify(manifest, null, 2);
  saveArtifactLocallyIfEnabled("document_manifest.json", manifestJson);
  const manifestAddress = await adapter.uploadArtifact("document_manifest.json", manifestJson);

  // ── 10. Download verification (0G only) ─────────────────────────────────
  if (adapterType === "zerog") {
    console.log("\n[verify] Downloading artifacts from 0G to verify round-trip …");
    const toVerify: Array<{ label: string; address: string }> = [
      { label: "clean_article.json",       address: addresses.cleanArticle },
      { label: "statements.json",           address: addresses.statements },
      { label: "retrieval_chunks.json",     address: addresses.retrievalChunks },
      { label: "document_manifest.json",    address: manifestAddress },
    ];
    if (addresses.refinedStatements) {
      toVerify.push({ label: "verified_statements.json", address: addresses.refinedStatements });
    }

    let allOk = true;
    for (const { label, address } of toVerify) {
      try {
        const raw = await adapter.downloadArtifact(address);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const keys = Object.keys(parsed).length;
        console.log(`[verify] ✓ ${label} (${raw.length} bytes, ${keys} top-level keys)`);
      } catch (err) {
        console.error(`[verify] ✗ ${label}: ${(err as Error).message}`);
        allOk = false;
      }
    }
    console.log(allOk ? "[verify] All artifacts verified successfully.\n" : "[verify] Some artifacts failed verification.\n");
  }

  // ── 11. Summary ──────────────────────────────────────────────────────────
  console.log("\n=== Pipeline Complete ===");
  console.log(`Attestation:         ${rawCapture.attestationId}`);
  console.log(`Paragraphs:          ${cleanArticle.paragraphs.length}`);
  console.log(`Statements:          ${validatedStatements.length} (deterministic)`);
  if (refinedStatementsArtifact) {
    const s = refinedStatementsArtifact.extraction_summary;
    console.log(`Refined statements:  ${s.total} total, ${s.verified} verified, ${s.unverified} unverified${refinedStatementsArtifact.llm_used ? ` (LLM: ${refinedStatementsArtifact.llm_model})` : " (deterministic only)"}`);
  }
  console.log(`Chunks:              ${retrievalChunks.chunks.length}`);
  console.log(`Vectors:             ${embeddings.vectors.length}`);
  console.log(`Manifest address:    ${manifestAddress}`);
  console.log(`clean_article:       ${addresses.cleanArticle}`);
  console.log(`statements:          ${addresses.statements}`);
  if (addresses.refinedStatements) {
    console.log(`verified_statements: ${addresses.refinedStatements}`);
  }
  console.log(`retrieval_chunks:    ${addresses.retrievalChunks}`);
  console.log(`embeddings:          ${addresses.embeddings}`);
}

main().catch((err) => {
  console.error("\n[FATAL] Pipeline failed:", err);
  process.exit(1);
});

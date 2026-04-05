/**
 * Core ingestion pipeline — callable from CLI (`index.ts`) or worker.
 */

import { loadRawCaptureFromStorage } from "./loadRawCapture.js";
import { extractMainArticle } from "./extractMainArticle.js";
import { buildCleanArticle } from "./buildCleanArticle.js";
import { validateStatements, buildParagraphMap } from "./validateStatements.js";
import { filterConservativeStatements } from "./conservativeAttribution.js";
import { extractStatementsFromCleanArticle } from "./llmExtractStatements.js";
import { deterministicStatementsToRefined } from "./verifyRefinedStatements.js";
import { buildRetrievalChunks } from "./buildRetrievalChunks.js";
import { generateEmbeddings } from "./generateEmbeddings.js";
import { uploadArtifacts } from "./uploadArtifacts.js";
import { createArchiveRunDir, archiveRootLabel } from "../utils/localArtifactArchive.js";
import { savePipelineJson } from "../utils/saveLocalArtifact.js";
import { buildDocumentManifest } from "./buildDocumentManifest.js";
import type { ArtifactUploadResult, StorageAdapter } from "../adapters/storage/StorageAdapter.js";
import type { RawCapture } from "../schemas/rawCapture.js";
import type { StatementsArtifact } from "../schemas/statements.js";
import type { RefinedStatementsArtifact } from "../schemas/refinedStatements.js";
import type { UploadedAddresses } from "./uploadArtifacts.js";

export interface RunIngestionJobInput {
  rawCapture: RawCapture;
  /** If set, raw JSON is already stored at this 0G address — skip re-upload */
  rawCaptureDataAddress?: string;
}

export interface RunIngestionJobOptions {
  /** Skip post-upload download verification (0G only; faster in workers) */
  skipStorageVerify?: boolean;
}

export interface RunIngestionJobResult {
  rawCapture: RawCapture;
  manifestAddress: string;
  rawCaptureAddress: string;
  addresses: UploadedAddresses;
  summary: {
    paragraphCount: number;
    statementCount: number;
    chunkCount: number;
    vectorCount: number;
    refinedStatementTotal?: number;
    refinedVerified?: number;
  };
}

export async function runIngestionJob(
  adapter: StorageAdapter,
  input: RunIngestionJobInput,
  options: RunIngestionJobOptions = {},
): Promise<RunIngestionJobResult> {
  const { rawCapture, rawCaptureDataAddress: existingAddress } = input;
  const dataAddress = existingAddress;

  console.log(`[job] Attestation: ${rawCapture.attestationId}`);
  console.log(`[job] Source URL:   ${rawCapture.sourceUrl}`);

  const archiveDir = createArchiveRunDir(rawCapture.attestationId, rawCapture.requestId);
  if (archiveDir) {
    console.log(`[archive] Local run folder: ${archiveRootLabel(archiveDir)} → ${archiveDir}`);
    savePipelineJson("raw_capture.json", JSON.stringify(rawCapture, null, 2), archiveDir);
  }

  console.log("[extract] Running Mozilla Readability …");
  const extracted = await extractMainArticle(rawCapture.dataBrut, rawCapture.sourceUrl);
  console.log(
    `[extract] Method: ${extracted.extractionMethod} | ` +
      `Paragraphs: ${extracted.paragraphs.length} | ` +
      `Title: "${extracted.title ?? "(none)"}"`,
  );

  const cleanArticle = buildCleanArticle(rawCapture, extracted);
  console.log(
    `[clean_article] ${cleanArticle.paragraphs.length} paragraphs | ` +
      `${cleanArticle.fullText.length} chars`,
  );
  savePipelineJson("clean_article.json", JSON.stringify(cleanArticle, null, 2), archiveDir);

  console.log("[statements] Extracting statements (LLM from clean_article) …");
  const { statements: rawStatements, modelUsed: statementLlmModel } =
    await extractStatementsFromCleanArticle(cleanArticle, rawCapture.attestationId);

  const paragraphMap = buildParagraphMap(cleanArticle.paragraphs);
  const validatedStatements = validateStatements(rawStatements, paragraphMap);
  const conservativeStatements = filterConservativeStatements(validatedStatements, paragraphMap);
  console.log(
    `[statements] ${rawStatements.length} extracted → ${validatedStatements.length} validated → ` +
      `${conservativeStatements.length} after conservative attribution`,
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
    statements: conservativeStatements,
  };
  savePipelineJson("statements.json", JSON.stringify(statementsArtifact, null, 2), archiveDir);

  const refinedFromStatements = deterministicStatementsToRefined(conservativeStatements, "llm");
  const refinedStatementsArtifact: RefinedStatementsArtifact = {
    schemaVersion: "1.0",
    attestationId: rawCapture.attestationId,
    requestId: rawCapture.requestId,
    sourceUrl: rawCapture.sourceUrl,
    llm_used: true,
    llm_model: statementLlmModel,
    statements: refinedFromStatements,
    extraction_summary: {
      total: refinedFromStatements.length,
      verified: refinedFromStatements.length,
      unverified: 0,
    },
  };

  console.log(
    `[verified_statements] ${refinedFromStatements.length} refined (LLM extraction, extracted_by=llm) | model: ${statementLlmModel}`,
  );

  savePipelineJson(
    "verified_statements.json",
    JSON.stringify(refinedStatementsArtifact, null, 2),
    archiveDir,
  );

  console.log("[chunks] Building retrieval chunks …");
  const retrievalChunks = buildRetrievalChunks(cleanArticle, conservativeStatements);
  console.log(`[chunks] ${retrievalChunks.chunks.length} total chunks`);
  savePipelineJson("retrieval_chunks.json", JSON.stringify(retrievalChunks, null, 2), archiveDir);

  console.log("[embeddings] Generating embeddings …");
  const embeddings = await generateEmbeddings(retrievalChunks.chunks, rawCapture.attestationId);
  console.log(
    `[embeddings] ${embeddings.vectors.length} vectors | model: ${embeddings.embeddingModel.model}`,
  );
  savePipelineJson("embeddings.json", JSON.stringify(embeddings, null, 2), archiveDir);

  // Raw capture address first so a slow/failing derived upload cannot block manifest construction.
  const rawCaptureJson = JSON.stringify(rawCapture, null, 2);
  const rawCaptureResult: ArtifactUploadResult = dataAddress
    ? { dataAddress, sequence: null, flowTxHash: null }
    : await adapter.uploadArtifact("raw_capture.json", rawCaptureJson);

  console.log("[upload] Uploading derived artifacts to storage …");
  const addresses = await uploadArtifacts(
    adapter,
    cleanArticle,
    statementsArtifact,
    retrievalChunks,
    embeddings,
    refinedStatementsArtifact,
  );

  const manifest = buildDocumentManifest(
    rawCapture,
    cleanArticle,
    rawCaptureResult,
    addresses,
    "completed",
  );

  const manifestJson = JSON.stringify(manifest, null, 2);
  // Toujours persister le manifest dans l’archive locale avant l’upload réseau (0G peut bloquer ou échouer).
  savePipelineJson("document_manifest.json", manifestJson, archiveDir);
  const manifestUpload = await adapter.uploadArtifact("document_manifest.json", manifestJson);
  const manifestAddress = manifestUpload.dataAddress;

  const adapterType = process.env.STORAGE_ADAPTER ?? "mock";
  if (adapterType === "zerog" && !options.skipStorageVerify) {
    console.log("\n[verify] Downloading artifacts from 0G to verify round-trip …");
    const toVerify: Array<{ label: string; address: string }> = [
      { label: "clean_article.json", address: addresses.cleanArticle.dataAddress },
      { label: "statements.json", address: addresses.statements.dataAddress },
      { label: "retrieval_chunks.json", address: addresses.retrievalChunks.dataAddress },
      { label: "document_manifest.json", address: manifestAddress },
    ];
    if (addresses.refinedStatements) {
      toVerify.push({
        label: "verified_statements.json",
        address: addresses.refinedStatements.dataAddress,
      });
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
    console.log(
      allOk ? "[verify] All artifacts verified successfully.\n" : "[verify] Some artifacts failed verification.\n",
    );
  }

  const s = refinedStatementsArtifact!.extraction_summary;

  if (archiveDir) {
    const runMeta = {
      archivedAt: new Date().toISOString(),
      attestationId: rawCapture.attestationId,
      requestId: rawCapture.requestId,
      sourceUrl: rawCapture.sourceUrl,
      storageAdapter: process.env.STORAGE_ADAPTER ?? "mock",
      localArchiveDir: archiveDir,
      rawCaptureAddress: rawCaptureResult.dataAddress,
      manifestAddress,
      addresses: {
        cleanArticle: addresses.cleanArticle.dataAddress,
        statements: addresses.statements.dataAddress,
        refinedStatements: addresses.refinedStatements?.dataAddress ?? null,
        retrievalChunks: addresses.retrievalChunks.dataAddress,
        embeddings: addresses.embeddings.dataAddress,
      },
      summary: {
        paragraphCount: cleanArticle.paragraphs.length,
        statementCount: conservativeStatements.length,
        chunkCount: retrievalChunks.chunks.length,
        vectorCount: embeddings.vectors.length,
        refinedStatementTotal: s.total,
        refinedVerified: s.verified,
      },
    };
    savePipelineJson("run_meta.json", JSON.stringify(runMeta, null, 2), archiveDir);
  }

  return {
    rawCapture,
    manifestAddress,
    rawCaptureAddress: rawCaptureResult.dataAddress,
    addresses,
    summary: {
      paragraphCount: cleanArticle.paragraphs.length,
      statementCount: conservativeStatements.length,
      chunkCount: retrievalChunks.chunks.length,
      vectorCount: embeddings.vectors.length,
      refinedStatementTotal: s.total,
      refinedVerified: s.verified,
    },
  };
}

/** Load raw capture from 0G when worker only has data address */
export async function loadRawCaptureForJob(
  adapter: StorageAdapter,
  rawCaptureDataAddress: string,
): Promise<RawCapture> {
  return loadRawCaptureFromStorage(adapter, rawCaptureDataAddress);
}

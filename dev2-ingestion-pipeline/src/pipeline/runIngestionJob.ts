/**
 * Core ingestion pipeline — callable from CLI (`index.ts`) or worker.
 */

import { loadRawCaptureFromStorage } from "./loadRawCapture.js";
import { extractMainArticle } from "./extractMainArticle.js";
import { buildCleanArticle } from "./buildCleanArticle.js";
import { extractStatements } from "./extractStatements.js";
import { validateStatements, buildParagraphMap } from "./validateStatements.js";
import { filterConservativeStatements } from "./conservativeAttribution.js";
import { runLlmRefinement } from "./llmRefinement.js";
import { verifyRefinedStatements, deterministicStatementsToRefined } from "./verifyRefinedStatements.js";
import { buildRetrievalChunks } from "./buildRetrievalChunks.js";
import { generateEmbeddings } from "./generateEmbeddings.js";
import { uploadArtifacts } from "./uploadArtifacts.js";
import { saveArtifactLocallyIfEnabled } from "../utils/saveLocalArtifact.js";
import { buildDocumentManifest } from "./buildDocumentManifest.js";
import type { StorageAdapter } from "../adapters/storage/StorageAdapter.js";
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

  console.log("[statements] Extracting statements (deterministic rules) …");
  const rawStatements = await extractStatements(
    cleanArticle.paragraphs,
    rawCapture.attestationId,
    { useLlmFallback: false },
  );

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

  const enableLlmRefinement = process.env.ENABLE_LLM_REFINEMENT === "true";
  let refinedStatementsArtifact: RefinedStatementsArtifact | undefined;

  if (enableLlmRefinement) {
    console.log("[llm-refinement] Running LLM refinement step …");
    const { statements: llmRaw, modelUsed } = await runLlmRefinement(cleanArticle);
    const deterministicRefined = deterministicStatementsToRefined(conservativeStatements);
    const llmVerified = verifyRefinedStatements(llmRaw, cleanArticle, { keepUnverified: false });
    const deterministicTexts = new Set(deterministicRefined.map((s) => s.statement_text.slice(0, 80)));
    const newFromLlm = llmVerified.filter(
      (s) => !deterministicTexts.has(s.statement_text.slice(0, 80)),
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
        `(${deterministicRefined.length} deterministic + ${newFromLlm.length} from LLM), ` +
        `${verifiedCount} verified`,
    );
  } else {
    const deterministicRefined = deterministicStatementsToRefined(conservativeStatements);
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

  console.log("[chunks] Building retrieval chunks …");
  const retrievalChunks = buildRetrievalChunks(cleanArticle, conservativeStatements);
  console.log(`[chunks] ${retrievalChunks.chunks.length} total chunks`);

  console.log("[embeddings] Generating embeddings …");
  const embeddings = await generateEmbeddings(retrievalChunks.chunks, rawCapture.attestationId);
  console.log(
    `[embeddings] ${embeddings.vectors.length} vectors | model: ${embeddings.embeddingModel.model}`,
  );

  console.log("[upload] Uploading artifacts to storage …");
  const addresses = await uploadArtifacts(
    adapter,
    cleanArticle,
    statementsArtifact,
    retrievalChunks,
    embeddings,
    refinedStatementsArtifact,
  );

  const rawCaptureJson = JSON.stringify(rawCapture, null, 2);
  saveArtifactLocallyIfEnabled("raw_capture.json", rawCaptureJson);
  const rawCaptureAddress =
    dataAddress ?? (await adapter.uploadArtifact("raw_capture.json", rawCaptureJson));

  const manifest = buildDocumentManifest(
    rawCapture,
    cleanArticle,
    rawCaptureAddress,
    addresses,
    "completed",
  );

  const manifestJson = JSON.stringify(manifest, null, 2);
  saveArtifactLocallyIfEnabled("document_manifest.json", manifestJson);
  const manifestAddress = await adapter.uploadArtifact("document_manifest.json", manifestJson);

  const adapterType = process.env.STORAGE_ADAPTER ?? "mock";
  if (adapterType === "zerog" && !options.skipStorageVerify) {
    console.log("\n[verify] Downloading artifacts from 0G to verify round-trip …");
    const toVerify: Array<{ label: string; address: string }> = [
      { label: "clean_article.json", address: addresses.cleanArticle },
      { label: "statements.json", address: addresses.statements },
      { label: "retrieval_chunks.json", address: addresses.retrievalChunks },
      { label: "document_manifest.json", address: manifestAddress },
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
    console.log(
      allOk ? "[verify] All artifacts verified successfully.\n" : "[verify] Some artifacts failed verification.\n",
    );
  }

  const s = refinedStatementsArtifact!.extraction_summary;
  return {
    rawCapture,
    manifestAddress,
    rawCaptureAddress,
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

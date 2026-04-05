/**
 * End-to-end pipeline test.
 *
 * Runs the full pipeline on the sample HTML fixture without any external API calls.
 * Validates that all artifacts are produced with correct structure.
 */

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

import { extractMainArticle } from "../pipeline/extractMainArticle.js";
import { buildCleanArticle } from "../pipeline/buildCleanArticle.js";
import { extractStatements } from "../pipeline/extractStatements.js";
import { validateStatements, buildParagraphMap } from "../pipeline/validateStatements.js";
import { buildRetrievalChunks } from "../pipeline/buildRetrievalChunks.js";
import { generateEmbeddings } from "../pipeline/generateEmbeddings.js";
import { uploadArtifacts } from "../pipeline/uploadArtifacts.js";
import { buildDocumentManifest } from "../pipeline/buildDocumentManifest.js";
import { MockStorageAdapter } from "../adapters/storage/MockStorageAdapter.js";
import type { RawCapture } from "../schemas/rawCapture.js";
import type { StatementsArtifact } from "../schemas/statements.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sampleHtml = readFileSync(
  resolve(__dirname, "../fixtures/sample-article.html"),
  "utf-8"
);

const sampleCapture: RawCapture = {
  schemaVersion: "1.0",
  attestationId: "0xe2e_test_attestation_001",
  requestId: "0xe2e_test_request_001",
  sourceUrl: "https://example.com/e2e-test",
  observedAt: "2026-04-04T12:00:00Z",
  contentType: "text/html",
  rawHash: "0xe2e_test_hash_001",
  dataBrut: sampleHtml,
};

describe("End-to-end pipeline", () => {
  it("produces all five artifacts with valid structure", async () => {
    // Step 1: Extract main article
    const extracted = await extractMainArticle(
      sampleCapture.dataBrut,
      sampleCapture.sourceUrl
    );
    expect(extracted.paragraphs.length).toBeGreaterThan(0);

    // Step 2: Build clean article
    const cleanArticle = buildCleanArticle(sampleCapture, extracted);
    expect(cleanArticle.schemaVersion).toBe("1.0");
    expect(cleanArticle.paragraphs.length).toBeGreaterThan(0);
    expect(cleanArticle.fullText.length).toBeGreaterThan(0);

    // Step 3: Extract and validate statements (no LLM)
    const rawStatements = await extractStatements(
      cleanArticle.paragraphs,
      sampleCapture.attestationId,
      { useLlmFallback: false }
    );
    const paraMap = buildParagraphMap(cleanArticle.paragraphs);
    const validatedStatements = validateStatements(rawStatements, paraMap);

    // Validate exact substring rule for every statement
    for (const stmt of validatedStatements) {
      const para = paraMap.get(stmt.sourceParagraphId)!;
      expect(para.text).toContain(stmt.content);
    }

    const statementsArtifact: StatementsArtifact = {
      schemaVersion: "1.0",
      attestationId: sampleCapture.attestationId,
      requestId: sampleCapture.requestId,
      sourceUrl: sampleCapture.sourceUrl,
      extractionPolicy: {
        allowParaphrases: false,
        preserveExactText: true,
        speakerAttributionRequired: true,
      },
      statements: validatedStatements,
    };

    // Step 4: Build retrieval chunks
    const retrievalChunks = buildRetrievalChunks(cleanArticle, validatedStatements);
    expect(retrievalChunks.chunks.length).toBe(
      validatedStatements.length + cleanArticle.paragraphs.length
    );

    // Step 5: Generate embeddings (stub mode – local ONNX model incompatible with Jest)
    const embeddings = await generateEmbeddings(
      retrievalChunks.chunks,
      sampleCapture.attestationId,
      { provider: "stub" }
    );

    expect(embeddings.vectors).toHaveLength(retrievalChunks.chunks.length);

    // Step 6: Upload to mock storage
    const outputDir = join(tmpdir(), `indelible_e2e_${randomBytes(4).toString("hex")}`);
    const adapter = new MockStorageAdapter(outputDir);

    const addresses = await uploadArtifacts(
      adapter,
      cleanArticle,
      statementsArtifact,
      retrievalChunks,
      embeddings
    );

    const rawCaptureAddress = await adapter.uploadArtifact(
      "raw_capture.json",
      JSON.stringify(sampleCapture, null, 2)
    );

    // Step 7: Build manifest
    const manifest = buildDocumentManifest(
      sampleCapture,
      cleanArticle,
      rawCaptureAddress,
      addresses,
      "completed"
    );

    expect(manifest.schemaVersion).toBe("1.0");
    expect(manifest.processing.status).toBe("completed");
    expect(Object.values(manifest.artifacts).every((a) => a.dataAddress)).toBe(true);

    // Upload manifest
    const manifestAddress = await adapter.uploadArtifact(
      "document_manifest.json",
      JSON.stringify(manifest, null, 2)
    );
    expect(manifestAddress.dataAddress).toBeTruthy();

    // Verify roundtrip: download and parse manifest
    const downloaded = await adapter.downloadArtifact(manifestAddress.dataAddress);
    const reparsed = JSON.parse(downloaded);
    expect(reparsed.attestationId).toBe(sampleCapture.attestationId);
    expect(reparsed.artifacts.cleanArticle.fileName).toBe("clean_article.json");
  });
});

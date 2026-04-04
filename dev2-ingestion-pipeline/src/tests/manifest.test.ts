/**
 * Tests for document manifest generation.
 */

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { extractMainArticle } from "../pipeline/extractMainArticle.js";
import { buildCleanArticle } from "../pipeline/buildCleanArticle.js";
import { buildDocumentManifest } from "../pipeline/buildDocumentManifest.js";
import { MockStorageAdapter } from "../adapters/storage/MockStorageAdapter.js";
import { uploadArtifacts } from "../pipeline/uploadArtifacts.js";
import { buildRetrievalChunks } from "../pipeline/buildRetrievalChunks.js";
import { generateEmbeddings } from "../pipeline/generateEmbeddings.js";
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
  attestationId: "0xtest_manifest_001",
  requestId: "0xtest_req_manifest_001",
  sourceUrl: "https://example.com/manifest-test",
  observedAt: "2026-04-04T12:00:00Z",
  contentType: "text/html",
  rawHash: "0xtest_hash_manifest",
  dataBrut: sampleHtml,
};

describe("buildDocumentManifest", () => {
  it("produces a manifest with all artifact addresses", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    const chunks = buildRetrievalChunks(clean, []);

    const embeddings = await generateEmbeddings(chunks.chunks, sampleCapture.attestationId, { provider: "stub" });

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
      statements: [],
    };

    const adapter = new MockStorageAdapter(
      join(tmpdir(), `indelible_manifest_test_${randomBytes(4).toString("hex")}`)
    );

    const addresses = await uploadArtifacts(
      adapter,
      clean,
      statementsArtifact,
      chunks,
      embeddings
    );

    const rawCaptureAddress = await adapter.uploadArtifact(
      "raw_capture.json",
      JSON.stringify(sampleCapture, null, 2)
    );

    const manifest = buildDocumentManifest(
      sampleCapture,
      clean,
      rawCaptureAddress,
      addresses,
      "completed"
    );

    expect(manifest.schemaVersion).toBe("1.0");
    expect(manifest.attestationId).toBe(sampleCapture.attestationId);
    expect(manifest.artifacts.rawCapture.dataAddress).toBeTruthy();
    expect(manifest.artifacts.cleanArticle.dataAddress).toBeTruthy();
    expect(manifest.artifacts.statements.dataAddress).toBeTruthy();
    expect(manifest.artifacts.retrievalChunks.dataAddress).toBeTruthy();
    expect(manifest.artifacts.embeddings.dataAddress).toBeTruthy();
    expect(manifest.processing.status).toBe("completed");
  });

  it("manifest references correct file names", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    const chunks = buildRetrievalChunks(clean, []);

    const embeddings = await generateEmbeddings(chunks.chunks, sampleCapture.attestationId, { provider: "stub" });

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
      statements: [],
    };

    const adapter = new MockStorageAdapter(
      join(tmpdir(), `indelible_manifest_test2_${randomBytes(4).toString("hex")}`)
    );

    const addresses = await uploadArtifacts(adapter, clean, statementsArtifact, chunks, embeddings);
    const rawAddr = await adapter.uploadArtifact("raw_capture.json", "{}");
    const manifest = buildDocumentManifest(sampleCapture, clean, rawAddr, addresses);

    expect(manifest.artifacts.rawCapture.fileName).toBe("raw_capture.json");
    expect(manifest.artifacts.cleanArticle.fileName).toBe("clean_article.json");
    expect(manifest.artifacts.statements.fileName).toBe("statements.json");
    expect(manifest.artifacts.retrievalChunks.fileName).toBe("retrieval_chunks.json");
    expect(manifest.artifacts.embeddings.fileName).toBe("embeddings.json");
  });
});

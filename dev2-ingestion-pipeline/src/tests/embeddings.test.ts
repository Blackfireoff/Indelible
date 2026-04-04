/**
 * Tests for embeddings generation (stub mode – no model loading, no API key required).
 *
 * Tests always pass provider: "stub" explicitly to avoid loading the local ONNX model,
 * which is incompatible with Jest's patched Float32Array environment.
 */

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { extractMainArticle } from "../pipeline/extractMainArticle.js";
import { buildCleanArticle } from "../pipeline/buildCleanArticle.js";
import { buildRetrievalChunks } from "../pipeline/buildRetrievalChunks.js";
import { generateEmbeddings } from "../pipeline/generateEmbeddings.js";
import type { RawCapture } from "../schemas/rawCapture.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sampleHtml = readFileSync(
  resolve(__dirname, "../fixtures/sample-article.html"),
  "utf-8"
);

const sampleCapture: RawCapture = {
  schemaVersion: "1.0",
  attestationId: "0xtest_embeddings_001",
  requestId: "0xtest_req_embed_001",
  sourceUrl: "https://example.com/embed-test",
  observedAt: "2026-04-04T12:00:00Z",
  contentType: "text/html",
  rawHash: "0xtest_hash_embed_001",
  dataBrut: sampleHtml,
};

describe("generateEmbeddings (stub mode)", () => {
  it("produces one vector per chunk", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    const chunks = buildRetrievalChunks(clean, []);

    const embeddings = await generateEmbeddings(
      chunks.chunks,
      sampleCapture.attestationId,
      { provider: "stub" }
    );

    expect(embeddings.vectors).toHaveLength(chunks.chunks.length);
  });

  it("vectors have consistent dimensions", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    const chunks = buildRetrievalChunks(clean, []);

    const embeddings = await generateEmbeddings(
      chunks.chunks,
      sampleCapture.attestationId,
      { provider: "stub" }
    );

    const expectedDim = embeddings.embeddingModel.dimension;
    for (const vec of embeddings.vectors) {
      expect(vec.vector).toHaveLength(expectedDim);
    }
  });

  it("preserves chunkId linkage in vectors", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    const chunks = buildRetrievalChunks(clean, []);

    const embeddings = await generateEmbeddings(
      chunks.chunks,
      sampleCapture.attestationId,
      { provider: "stub" }
    );

    const chunkIds = new Set(chunks.chunks.map((c) => c.chunkId));
    for (const vec of embeddings.vectors) {
      expect(chunkIds.has(vec.chunkId)).toBe(true);
    }
  });

  it("schema version is 1.0", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    const chunks = buildRetrievalChunks(clean, []);

    const embeddings = await generateEmbeddings(
      chunks.chunks,
      sampleCapture.attestationId,
      { provider: "stub" }
    );

    expect(embeddings.schemaVersion).toBe("1.0");
    expect(embeddings.attestationId).toBe(sampleCapture.attestationId);
  });
});

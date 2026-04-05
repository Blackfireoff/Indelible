/**
 * Tests for statement extraction, validation, and chunk construction.
 */

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { extractMainArticle } from "../pipeline/extractMainArticle.js";
import { buildCleanArticle } from "../pipeline/buildCleanArticle.js";
import { extractStatements } from "../pipeline/extractStatements.js";
import { validateStatements, buildParagraphMap } from "../pipeline/validateStatements.js";
import { buildRetrievalChunks } from "../pipeline/buildRetrievalChunks.js";
import type { RawCapture } from "../schemas/rawCapture.js";
import type { ArticleParagraph } from "../schemas/cleanArticle.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, "../fixtures");

const sampleHtml = readFileSync(join(FIXTURES_DIR, "sample-article.html"), "utf-8");

const sampleCapture: RawCapture = {
  schemaVersion: "1.0",
  attestationId: "0xtest_attestation_002",
  requestId: "0xtest_request_002",
  sourceUrl: "https://example.com/test-article-2",
  observedAt: "2026-04-04T12:00:00Z",
  contentType: "text/html",
  rawHash: "0xtest_hash_002",
  dataBrut: sampleHtml,
};

// ── Statement content must be exact substring ─────────────────────────────────

describe("validateStatements – exact substring rule", () => {
  it("rejects statements whose content is not in the source paragraph", () => {
    const para: ArticleParagraph = {
      paragraphId: "para_test_001",
      order: 1,
      text: "President Trump said the United States was ready for talks.",
      charStart: 0,
      charEnd: 58,
      sourceHints: { tagName: "p", cssSelector: null },
    };

    const fakeStatement = {
      statementId: "stmt_fake",
      speaker: {
        name: "Donald Trump",
        role: null,
        normalizedId: "donald_trump",
      },
      quoteType: "direct" as const,
      content: "This text does not appear in the paragraph at all",
      cue: "said",
      sourceParagraphId: "para_test_001",
      charStart: 0,
      charEnd: 49,
      contextWindow: { precedingText: "", followingText: "" },
      confidence: 0.9,
      validation: { status: "auto_accepted" as const, reviewRequired: false },
    };

    const paraMap = new Map([[para.paragraphId, para]]);
    const validated = validateStatements([fakeStatement], paraMap);
    // Should be filtered out (rejected)
    expect(validated).toHaveLength(0);
  });

  it("accepts statements that are exact substrings", () => {
    const text = 'President Trump said "We are ready for talks." at the White House.';
    const para: ArticleParagraph = {
      paragraphId: "para_test_002",
      order: 1,
      text,
      charStart: 0,
      charEnd: text.length,
      sourceHints: { tagName: "p", cssSelector: null },
    };

    const content = "We are ready for talks.";
    const idx = text.indexOf(content);

    const validStatement = {
      statementId: "stmt_valid",
      speaker: { name: "Donald Trump", role: null, normalizedId: "donald_trump" },
      quoteType: "direct" as const,
      content,
      cue: "said",
      sourceParagraphId: "para_test_002",
      charStart: idx,
      charEnd: idx + content.length,
      contextWindow: { precedingText: "", followingText: "" },
      confidence: 0.9,
      validation: { status: "auto_accepted" as const, reviewRequired: false },
    };

    const paraMap = new Map([[para.paragraphId, para]]);
    const validated = validateStatements([validStatement], paraMap);
    expect(validated).toHaveLength(1);
    expect(validated[0].content).toBe(content);
  });
});

// ── End-to-end extraction from sample HTML ────────────────────────────────────

describe("extractStatements – sample article", () => {
  it("extracts at least one direct quote", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);

    // Disable LLM fallback for deterministic tests
    const statements = await extractStatements(
      clean.paragraphs,
      sampleCapture.attestationId,
      { useLlmFallback: false }
    );

    expect(statements.length).toBeGreaterThan(0);
  });

  it("all validated statement contents are exact substrings of their paragraphs", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);

    const statements = await extractStatements(
      clean.paragraphs,
      sampleCapture.attestationId,
      { useLlmFallback: false }
    );

    const paraMap = buildParagraphMap(clean.paragraphs);
    const validated = validateStatements(statements, paraMap);

    for (const stmt of validated) {
      const para = paraMap.get(stmt.sourceParagraphId)!;
      expect(para).toBeDefined();
      expect(para.text).toContain(stmt.content);
    }
  });

  it("all statement IDs are unique", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    const statements = await extractStatements(
      clean.paragraphs,
      sampleCapture.attestationId,
      { useLlmFallback: false }
    );

    const ids = statements.map((s) => s.statementId);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });

  it("speaker normalizedIds follow snake_case format", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    const statements = await extractStatements(
      clean.paragraphs,
      sampleCapture.attestationId,
      { useLlmFallback: false }
    );

    for (const stmt of statements) {
      expect(stmt.speaker.normalizedId).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

// ── buildRetrievalChunks ──────────────────────────────────────────────────────

describe("buildRetrievalChunks", () => {
  it("produces statement and paragraph chunks", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    const statements = await extractStatements(
      clean.paragraphs,
      sampleCapture.attestationId,
      { useLlmFallback: false }
    );
    const paraMap = buildParagraphMap(clean.paragraphs);
    const validated = validateStatements(statements, paraMap);
    const chunks = buildRetrievalChunks(clean, validated);

    const statementChunks = chunks.chunks.filter((c) => c.chunkType === "statement");
    const paragraphChunks = chunks.chunks.filter((c) => c.chunkType === "paragraph");

    expect(statementChunks.length).toBe(validated.length);
    expect(paragraphChunks.length).toBe(clean.paragraphs.length);
    expect(chunks.chunks.length).toBe(validated.length + clean.paragraphs.length);
  });

  it("chunk IDs are unique", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    const statements = await extractStatements(
      clean.paragraphs,
      sampleCapture.attestationId,
      { useLlmFallback: false }
    );
    const paraMap = buildParagraphMap(clean.paragraphs);
    const validated = validateStatements(statements, paraMap);
    const chunks = buildRetrievalChunks(clean, validated);

    const ids = chunks.chunks.map((c) => c.chunkId);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });

  it("statement chunks carry speaker metadata", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    const statements = await extractStatements(
      clean.paragraphs,
      sampleCapture.attestationId,
      { useLlmFallback: false }
    );
    const paraMap = buildParagraphMap(clean.paragraphs);
    const validated = validateStatements(statements, paraMap);
    const chunks = buildRetrievalChunks(clean, validated);

    const stmtChunks = chunks.chunks.filter((c) => c.chunkType === "statement");
    for (const chunk of stmtChunks) {
      expect(chunk.metadata.speaker).toBeTruthy();
      expect(chunk.statementId).toBeTruthy();
    }
  });

  it("paragraph chunks have null speaker", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    const chunks = buildRetrievalChunks(clean, []);

    const paraChunks = chunks.chunks.filter((c) => c.chunkType === "paragraph");
    for (const chunk of paraChunks) {
      expect(chunk.metadata.speaker).toBeNull();
      expect(chunk.statementId).toBeNull();
    }
  });
});

/**
 * Tests for the RAG pipeline.
 * Run with: npx jest tests/rag-pipeline.test.ts
 */

import { query } from "../src/agent/agent";
import { getStorageAdapter } from "../src/storage/0g-adapter";
import { validateRetrieval, validateCitations } from "../src/agent/guardrails";
import type { RetrievedChunk } from "../src/storage/types";

describe("RAG Pipeline Tests", () => {
  describe("No answer without retrieved chunks", () => {
    it("should return insufficient evidence when no document exists", async () => {
      const result = await query("What tariffs were discussed?", "doc-nonexistent");
      expect(result.retrievalPassed).toBe(false);
      expect(result.output.citations).toHaveLength(0);
      expect(result.output.limitations).toContain("No chunks retrieved");
    });

    it("should produce answer when chunks exist", async () => {
      const result = await query("What did Trump say about tariffs?", "doc-001");
      expect(result.output.answer.length).toBeGreaterThan(0);
    });
  });

  describe("Every citation points to valid chunkId and storagePointer", () => {
    it("should have valid 0G storage pointers in citations", async () => {
      const result = await query("What did Trump say about tariffs?", "doc-001");
      for (const citation of result.output.citations) {
        expect(citation.chunkId).toMatch(/^doc-\d+-chunk-\d+$/);
        expect(citation.storagePointer).toMatch(/^0g:\/\//);
        expect(citation.storagePointer).toContain(citation.chunkId);
      }
    });

    it("should have valid sourceUrl and observedAt in citations", async () => {
      const result = await query("What did Trump say about tariffs?", "doc-001");
      for (const citation of result.output.citations) {
        expect(citation.sourceUrl).toMatch(/^https?:\/\//);
        expect(citation.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      }
    });

    it("should list used chunkIds in evidence array", async () => {
      const result = await query("What did Trump say about tariffs?", "doc-001");
      expect(result.output.evidence.length).toBeGreaterThan(0);
      for (const chunkId of result.output.evidence) {
        expect(chunkId).toMatch(/^doc-\d+-chunk-\d+$/);
      }
    });
  });

  describe("Insufficient evidence behavior", () => {
    it("should reject low-score retrieval", () => {
      const emptyChunks: RetrievedChunk[] = [];
      const result = validateRetrieval(emptyChunks);
      expect(result.allowed).toBe(false);
      expect(result.output.limitations).toContain("No chunks retrieved");
    });

    it("should accept high-quality retrieval", () => {
      const goodChunks: RetrievedChunk[] = [
        {
          chunkId: "doc-001-chunk-0001",
          documentId: "doc-001",
          seq: 1,
          text: "Test text",
          charStart: 0,
          charEnd: 9,
          tokenCount: 2,
          sectionPath: [],
          speaker: null,
          sourceUrl: "https://example.com",
          observedAt: "2026-04-04T00:00:00Z",
          rawContentHash: "0x0",
          canonicalTextHash: "0x0",
          storagePointer: "0g://chunks/doc-001/chunk-0001.json",
          prevChunkId: null,
          nextChunkId: null,
          score: 0.9,
        },
      ];
      const result = validateRetrieval(goodChunks);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Citation validation", () => {
    it("should reject output without citations", () => {
      const badOutput = {
        answer: "Some answer without citations",
        citations: [],
        confidence: 0.5,
        evidence: [],
        limitations: "",
      };
      const result = validateCitations(badOutput);
      expect(result.allowed).toBe(false);
    });

    it("should reject output with invalid storage pointer", () => {
      const badOutput = {
        answer: "Some answer",
        citations: [
          {
            chunkId: "doc-001-chunk-0001",
            quote: "test",
            sourceUrl: "https://example.com",
            observedAt: "2026-04-04T00:00:00Z",
            storagePointer: "invalid-pointer",
          },
        ],
        confidence: 0.5,
        evidence: ["doc-001-chunk-0001"],
        limitations: "",
      };
      const result = validateCitations(badOutput);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("0g://");
    });

    it("should accept valid citation output", () => {
      const goodOutput = {
        answer: "Valid answer",
        citations: [
          {
            chunkId: "doc-001-chunk-0001",
            quote: "Test quote",
            sourceUrl: "https://example.com",
            observedAt: "2026-04-04T00:00:00Z",
            storagePointer: "0g://chunks/doc-001/chunk-0001.json",
          },
        ],
        confidence: 0.85,
        evidence: ["doc-001-chunk-0001"],
        limitations: "",
      };
      const result = validateCitations(goodOutput);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Storage adapter", () => {
    it("should fetch manifest by documentId", async () => {
      const adapter = getStorageAdapter();
      const manifest = await adapter.getManifest("doc-001");
      expect(manifest).not.toBeNull();
      expect(manifest!.documentId).toBe("doc-001");
      expect(manifest!.chunks.length).toBeGreaterThan(0);
    });

    it("should fetch chunk by id and pointer", async () => {
      const adapter = getStorageAdapter();
      const chunk = await adapter.getChunk(
        "doc-001-chunk-0001",
        "0g://chunks/doc-001/chunk-0001.json"
      );
      expect(chunk).not.toBeNull();
      expect(chunk!.chunkId).toBe("doc-001-chunk-0001");
      expect(chunk!.text).toContain("Interviewer");
    });

    it("should list all chunks for a document", async () => {
      const adapter = getStorageAdapter();
      const chunks = await adapter.listChunksForDocument("doc-001");
      expect(chunks.length).toBe(3);
    });
  });
});

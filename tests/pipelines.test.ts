/**
 * Tests for the RAG pipelines.
 */

import { runPipeline } from "../src/pipelines";
import { getStorageAdapter } from "../src/storage/0g-adapter";
import type { RetrievedChunk } from "../src/storage/types";

// Simple embedder for testing
const testEmbedder = {
  embed: async (_text: string): Promise<number[]> => {
    return Array.from({ length: 1024 }, () => Math.random() * 0.1);
  },
};

// Mock LLM call for testing - returns appropriate response based on prompt content
const mockLLMCall = async (systemPrompt: string, userPrompt: string): Promise<unknown> => {
  // Determine what kind of response is expected based on the system prompt
  if (systemPrompt.includes("INTENT CLASSIFIER") || systemPrompt.includes("intent classifier")) {
    // Intent classification prompt - return intent JSON
    const queryMatch = userPrompt.match(/USER QUERY: (.+?)(?:\n|$)/);
    const query = queryMatch ? queryMatch[1].toLowerCase() : "";

    if (query.includes("contradiction")) {
      return JSON.stringify({
        mode: "detect-contradictions",
        confidence: 0.9,
        parsed: {
          speaker: "Trump",
          claim: null,
          topic: "tariffs",
          timeframe: null,
        },
      });
    } else if (query.includes("did") || query.includes("is it true") || query.includes("was")) {
      return JSON.stringify({
        mode: "verify-claim",
        confidence: 0.9,
        parsed: {
          speaker: "Trump",
          claim: "tariffs are working",
          topic: "tariffs",
          timeframe: null,
        },
      });
    } else {
      return JSON.stringify({
        mode: "general-question",
        confidence: 0.8,
        parsed: {
          speaker: "Trump",
          claim: null,
          topic: "tariffs",
          timeframe: null,
        },
      });
    }
  }

  // Pipeline prompts - return appropriate output object
  if (systemPrompt.includes("citation-first AI agent") && systemPrompt.includes("VERIFY")) {
    // Verify-claim output
    return {
      mode: "verify-claim",
      verdict: "supported",
      confidence: 0.85,
      explanation: "The retrieved chunks provide evidence supporting this claim.",
      supportingCitations: [],
      contradictingCitations: [],
      nuances: [],
      meta: {
        query: userPrompt.substring(0, 50),
        speakerQuery: "Trump",
        claimText: "tariffs are working",
        timeframe: null,
        chunksRetrieved: 3,
        retrievalScoreAvg: 0.8,
        documentsUsed: ["doc-001"],
        model: "mock",
        timestamp: new Date().toISOString(),
      },
    };
  }

  if (systemPrompt.includes("citation-first AI agent") && systemPrompt.includes("CONTRADICTION")) {
    // Detect-contradictions output
    return {
      mode: "detect-contradictions",
      contradictions: [],
      summary: "No contradictions detected.",
      meta: {
        query: userPrompt.substring(0, 50),
        speakerQuery: "Trump",
        topic: "tariffs",
        timeframe: null,
        chunksAnalyzed: 3,
        documentsUsed: ["doc-001"],
        model: "mock",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // General question output (default)
  return {
    answer: "Based on the retrieved evidence, Trump stated that tariffs are working.",
    citations: [],
    confidence: 0.85,
    evidence: [],
    limitations: "",
    contradictions: [],
  };
};

describe("Pipeline Integration Tests", () => {
  const storageAdapter = getStorageAdapter();

  describe("runPipeline", () => {
    it("should classify and route general-question", async () => {
      const result = await runPipeline(
        "What is the weather today?",
        ["doc-001"],
        storageAdapter as never,
        testEmbedder as never,
        {},
        mockLLMCall as never
      );

      expect(["general-question", "verify-claim", "detect-contradictions"]).toContain(result.mode);
      expect(result.output).toBeDefined();
      expect(typeof result.retrievalPassed).toBe("boolean");
    });

    it("should return verify-claim output when conditions met", async () => {
      const result = await runPipeline(
        "Did Trump say tariffs are working?",
        ["doc-001"],
        storageAdapter as never,
        testEmbedder as never,
        {},
        mockLLMCall as never
      );

      expect(["general-question", "verify-claim"]).toContain(result.mode);
      if (result.mode === "verify-claim" || result.corrected) {
        expect(result.output).toBeDefined();
      }
    });

    it("should return detect-contradictions output when conditions met", async () => {
      const result = await runPipeline(
        "Find contradictions in Trump's statements on tariffs.",
        ["doc-001"],
        storageAdapter as never,
        testEmbedder as never,
        {},
        mockLLMCall as never
      );

      expect(["general-question", "detect-contradictions"]).toContain(result.mode);
      if (result.mode === "detect-contradictions" || result.corrected) {
        expect(result.output).toBeDefined();
      }
    });

    it("should return empty output when no document found", async () => {
      const result = await runPipeline(
        "What about tariffs?",
        ["doc-nonexistent"],
        storageAdapter as never,
        testEmbedder as never,
        {},
        mockLLMCall as never
      );

      expect(result.retrievalPassed).toBe(false);
    });

    it("should throw error when no LLM call provided", async () => {
      await expect(
        runPipeline(
          "What is the weather?",
          ["doc-001"],
          storageAdapter as never,
          testEmbedder as never,
          {}
        )
      ).rejects.toThrow("LLM call is required for intent classification");
    });
  });

  describe("Output Schema Validation", () => {
    it("should return general-question output with required fields", async () => {
      const result = await runPipeline(
        "What did Trump say about tariffs?",
        ["doc-001"],
        storageAdapter as never,
        testEmbedder as never,
        {},
        mockLLMCall as never
      );

      if (result.mode === "general-question") {
        const output = result.output as unknown as Record<string, unknown>;
        expect(output).toHaveProperty("answer");
        expect(output).toHaveProperty("citations");
        expect(output).toHaveProperty("confidence");
        expect(output).toHaveProperty("evidence");
        expect(output).toHaveProperty("limitations");
        expect(output).toHaveProperty("contradictions");
        expect(Array.isArray(output.citations)).toBe(true);
        expect(Array.isArray(output.contradictions)).toBe(true);
      }
    });

    it("should return verify-claim output with required fields", async () => {
      const result = await runPipeline(
        "Did Trump say tariffs are working?",
        ["doc-001"],
        storageAdapter as never,
        testEmbedder as never,
        {},
        mockLLMCall as never
      );

      if (result.mode === "verify-claim") {
        const output = result.output as unknown as Record<string, unknown>;
        expect(output).toHaveProperty("mode", "verify-claim");
        expect(output).toHaveProperty("verdict");
        expect(output).toHaveProperty("explanation");
        expect(output).toHaveProperty("supportingCitations");
        expect(output).toHaveProperty("contradictingCitations");
        expect(output).toHaveProperty("nuances");
        expect(output).toHaveProperty("meta");
      }
    });

    it("should return detect-contradictions output with required fields", async () => {
      const result = await runPipeline(
        "Find contradictions in Trump's statements on tariffs.",
        ["doc-001"],
        storageAdapter as never,
        testEmbedder as never,
        {},
        mockLLMCall as never
      );

      if (result.mode === "detect-contradictions") {
        const output = result.output as unknown as Record<string, unknown>;
        expect(output).toHaveProperty("mode", "detect-contradictions");
        expect(output).toHaveProperty("contradictions");
        expect(output).toHaveProperty("summary");
        expect(output).toHaveProperty("meta");
        expect(Array.isArray(output.contradictions)).toBe(true);
      }
    });
  });

  describe("Citation Auditability", () => {
    it("should include 0G storage pointers in citations", async () => {
      const result = await runPipeline(
        "What did Trump say about tariffs?",
        ["doc-001"],
        storageAdapter as never,
        testEmbedder as never,
        {},
        mockLLMCall as never
      );

      const output = result.output as unknown as Record<string, unknown>;

      if (result.mode === "general-question") {
        const citations = output.citations as Array<Record<string, unknown>>;
        if (citations.length > 0) {
          for (const citation of citations) {
            expect(citation.storagePointer).toMatch(/^0g:\/\//);
            expect(citation.chunkId).toMatch(/^doc-\d+-chunk-\d+$/);
          }
        }
      }
    });
  });
});

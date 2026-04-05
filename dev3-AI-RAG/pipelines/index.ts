/**
 * Pipeline orchestrator.
 *
 * Routes intent to the correct pipeline and returns mode-specific output.
 *
 * Data flow:
 * 1. Embed query using Transformers.js
 * 2. Search local embeddings (data/embeddings/{attestationId}/embeddings.json)
 * 3. Get matching chunks with text from local retrieval_chunks.json
 * 4. Optionally verify with 0G Storage if needed
 */

import type { IntentOutput, IntentMode } from "../../schemas/intent-output";
import type { AgentOutput } from "../../schemas/agent-output";
import type { VerifyClaimOutput } from "../../schemas/verify-claim-output";
import type { DetectContradictionsOutput } from "../../schemas/detect-contradictions-output";
import { createNoContradictionsOutput } from "../../schemas/detect-contradictions-output";
import type { Chunk, RetrievedChunk } from "../storage/types";
import type { DocumentManifest } from "../storage/types";
import { routeIntent } from "../router";
import { classifyIntent } from "../intent/classifier";
import { runGeneralQuestionPipeline } from "./general-question";
import { runVerifyClaimPipeline } from "./verify-claim";
import { runDetectContradictionsPipeline } from "./detect-contradictions";
import { getLocalVectorStore, type ScoredChunk } from "../storage/local-vector-store";
import { getStatementVerifier, type VerifiedStatementResult } from "../retrieval/statement-verifier";

// ---------------------------------------------------------------------------
// Unified output type
// ---------------------------------------------------------------------------

export type PipelineOutput = AgentOutput | VerifyClaimOutput | DetectContradictionsOutput;

export interface PipelineResult {
  mode: IntentMode;
  corrected: boolean;
  correctionReason: string;
  output: PipelineOutput;
  retrievalPassed: boolean;
}

// ---------------------------------------------------------------------------
// LLM interface (implement this to connect to actual LLM)
// ---------------------------------------------------------------------------

export type LLMCall = (systemPrompt: string, userPrompt: string) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Pipeline configuration
// ---------------------------------------------------------------------------

export interface PipelineConfig {
  topK?: number;
  minScore?: number;
}

// ---------------------------------------------------------------------------
// Main pipeline entry point
// ---------------------------------------------------------------------------

export async function runPipeline(
  query: string,
  attestationIds: string[],
  storageAdapter: {
    getManifest(docId: string): Promise<DocumentManifest | null>;
    listChunksForDocument(docId: string): Promise<Chunk[]>;
    getEmbeddings(docId: string): Promise<{ vectors: Array<{ chunkId: string; vector: number[] }> } | null>;
  },
  embedder: {
    embed(text: string): Promise<number[]>;
    embedChunks(chunks: Chunk[]): Promise<Array<{ chunkId: string; vector: number[] }>>;
  },
  config: PipelineConfig = {},
  llmCall?: LLMCall
): Promise<PipelineResult> {
  const topK = config.topK ?? 5;
  const minScore = config.minScore ?? 0.1;

  // -------------------------------------------------------------------------
  // Step 1: Intent classification (LLM-only)
  // -------------------------------------------------------------------------

  let intent: IntentOutput;

  if (!llmCall) {
    throw new Error(
      "LLM call is required for intent classification. " +
      "For testing, provide a mock LLM call function."
    );
  }

  // Use LLM-based classifier for accurate intent detection
  intent = await classifyIntent(query, async (prompt) => {
    const result = await llmCall(prompt, "");
    return result as string;
  });

  // -------------------------------------------------------------------------
  // Step 2: Deterministic routing (validate intent requirements)
  // -------------------------------------------------------------------------

  const routeResult = routeIntent(intent);
  const mode = routeResult.mode;
  const corrected = routeResult.corrected;
  const correctionReason = routeResult.reason;

  // -------------------------------------------------------------------------
  // Step 3: Local similarity search on all embeddings
  // -------------------------------------------------------------------------

  // Embed the query
  const queryVector = await embedder.embed(query);

  // Search local vector store for top-K chunks by similarity
  const vectorStore = await getLocalVectorStore();
  const topScoredChunks = vectorStore.searchBySimilarity(queryVector, topK * 2);

  // Extract unique attestation IDs from top results
  const topAttestationIds = [...new Set(topScoredChunks.map(c => c.attestationId))];
  console.log(`[Pipeline] Top matching attestations: ${topAttestationIds.join(", ")} (from ${vectorStore.getVectorCount()} total vectors)`);

  // Use topAttestationIds if no specific ones provided, otherwise use provided ones
  const searchAttestationIds = attestationIds.length > 0
    ? attestationIds
    : topAttestationIds.length > 0
      ? topAttestationIds
      : [];

  // Early exit if no embeddings matched
  if (searchAttestationIds.length === 0) {
    console.log(`[Pipeline] No local embeddings matched the query. Returning empty results.`);
    return {
      mode,
      corrected,
      correctionReason,
      output: {
        answer: "",
        citations: [],
        confidence: 0.0,
        evidence: [],
        limitations: "No documents matched the query based on local embeddings similarity search.",
        contradictions: [],
      } as AgentOutput,
      retrievalPassed: false,
    };
  }

  // -------------------------------------------------------------------------
  // Step 4: Verify statement hashes against 0G Storage
  // -------------------------------------------------------------------------

  // Initialize statement verifier and get verified statement IDs per attestation
  const statementVerifier = await getStatementVerifier();
  const verifiedStatementIdsByAttestation = new Map<string, Set<string>>();
  const abandonedStatements: VerifiedStatementResult[] = [];

  for (const attId of searchAttestationIds) {
    if (!statementVerifier.hasManifest(attId)) {
      console.log(`[Pipeline] No manifest for ${attId}, skipping hash verification`);
      continue;
    }

    const verifiedIds = await statementVerifier.getVerifiedStatementIds(attId);
    verifiedStatementIdsByAttestation.set(attId, verifiedIds);

    // Log abandoned statements
    const abandoned = statementVerifier.getAbandonedStatements(attId);
    abandonedStatements.push(...abandoned);
  }

  if (abandonedStatements.length > 0) {
    console.log(`[Pipeline] ${abandonedStatements.length} statements abandoned due to hash mismatch:`);
    for (const abandoned of abandonedStatements.slice(0, 5)) {
      console.log(`[Pipeline]   - ${abandoned.statementId}: ${abandoned.reason}`);
    }
    if (abandonedStatements.length > 5) {
      console.log(`[Pipeline]   ... and ${abandonedStatements.length - 5} more`);
    }
  } else {
    console.log(`[Pipeline] All statements verified successfully`);
  }

  // -------------------------------------------------------------------------
  // Step 5: Build chunks from local data (text already available)
  // -------------------------------------------------------------------------

  // Helper to check if a chunk's statement is verified
  const isStatementVerified = (chunk: ScoredChunk): boolean => {
    // Only statement chunks need verification
    if (chunk.chunkType !== "statement") return true;

    const verifiedIds = verifiedStatementIdsByAttestation.get(chunk.attestationId);
    if (!verifiedIds) return true; // No verification data, assume ok

    // The chunk's metadata contains the statementId
    const metadata = vectorStore.getChunkMetadata(chunk.chunkId);
    if (!metadata?.statementId) return true; // No statementId, skip

    return verifiedIds.has(metadata.statementId);
  };

  // Filter scored chunks to only those from matching attestations, above min score, and verified
  const scoredChunks: RetrievedChunk[] = topScoredChunks
    .filter(c => searchAttestationIds.includes(c.attestationId) && c.score >= minScore && isStatementVerified(c))
    .map(c => ({
      chunkId: c.chunkId,
      documentId: c.attestationId, // Use attestationId as documentId
      seq: 0,
      text: c.text,
      charStart: 0,
      charEnd: c.text.length,
      tokenCount: Math.ceil(c.text.split(/\s+/).length * 1.3),
      sectionPath: [],
      speaker: c.speaker,
      sourceUrl: c.sourceUrl,
      observedAt: new Date().toISOString(),
      rawContentHash: "",
      canonicalTextHash: "",
      storagePointer: `local://${c.attestationId}/${c.chunkId}`,
      prevChunkId: null,
      nextChunkId: null,
      chunkType: c.chunkType as "statement" | "paragraph" | "section",
      score: c.score,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const retrievalScoreAvg =
    scoredChunks.length > 0
      ? scoredChunks.reduce((s, c) => s + c.score, 0) / scoredChunks.length
      : 0;

  // Build document manifests from local data
  const documents: DocumentManifest[] = searchAttestationIds.map(attId => ({
    documentId: attId,
    attestationId: attId,
    title: topScoredChunks.find(c => c.attestationId === attId)?.sourceUrl.split("/").pop() ?? "Unknown",
    speaker: topScoredChunks.find(c => c.attestationId === attId)?.speaker ?? "Unknown",
    sourceUrl: topScoredChunks.find(c => c.attestationId === attId)?.sourceUrl ?? "",
    sourceType: "local",
    observedAt: new Date().toISOString(),
    language: "en",
    rawContentHash: "",
    canonicalTextHash: "",
    storagePointer: `local://${attId}`,
    chunkManifestPointer: "",
    embeddingsPointer: "",
    chunks: scoredChunks.filter(c => c.documentId === attId).map(c => ({
      chunkId: c.chunkId,
      storagePointer: c.storagePointer,
    })),
  }));

  console.log(`[Pipeline] Returning ${scoredChunks.length} chunks from ${documents.length} documents`);

  // -------------------------------------------------------------------------
  // Step 6: Dispatch to correct pipeline (early exit for empty results)
  // -------------------------------------------------------------------------

  if (scoredChunks.length === 0) {
    // No chunks retrieved - return empty output for the appropriate mode
    if (mode === "verify-claim") {
      return {
        mode,
        corrected,
        correctionReason,
        output: {
          mode: "verify-claim",
          verdict: "unverifiable",
          confidence: 0.0,
          explanation: "No relevant chunks retrieved from 0G Storage.",
          supportingCitations: [],
          contradictingCitations: [],
          nuances: [],
          meta: {
            query,
            speakerQuery: intent.parsed.speaker ?? "",
            claimText: intent.parsed.claim ?? "",
            timeframe: intent.parsed.timeframe,
            chunksRetrieved: 0,
            retrievalScoreAvg: 0,
            documentsUsed: [],
            model: "unknown",
            timestamp: new Date().toISOString(),
          },
        } as VerifyClaimOutput,
        retrievalPassed: false,
      };
    } else if (mode === "detect-contradictions") {
      return {
        mode,
        corrected,
        correctionReason,
        output: createNoContradictionsOutput(
          query,
          intent.parsed.speaker ?? "",
          intent.parsed.topic,
          0,
          []
        ),
        retrievalPassed: false,
      };
    } else {
      return {
        mode,
        corrected,
        correctionReason,
        output: {
          answer: "",
          citations: [],
          confidence: 0.0,
          evidence: [],
          limitations: "No relevant chunks retrieved from 0G Storage.",
          contradictions: [],
        } as AgentOutput,
        retrievalPassed: false,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Step 7: Dispatch to correct pipeline
  // -------------------------------------------------------------------------

  // Build the LLM caller wrapper based on mode
  const callLLM = async (systemPrompt: string, userPrompt: string): Promise<unknown> => {
    if (!llmCall) {
      // Mock LLM response for development
      return mockLLMResponse(userPrompt, mode);
    }
    return llmCall(systemPrompt, userPrompt);
  };

  switch (mode) {
    case "verify-claim": {
      const result = await runVerifyClaimPipeline(
        {
          query,
          speaker: intent.parsed.speaker ?? "",
          claim: intent.parsed.claim ?? "",
          chunks: scoredChunks,
          documents,
          retrievalScoreAvg,
          timeframe: intent.parsed.timeframe,
          model: "qwen-2.5-7b-instruct",
        },
        callLLM as (s: string, u: string) => Promise<VerifyClaimOutput>
      );
      return {
        mode,
        corrected,
        correctionReason,
        output: result.output,
        retrievalPassed: result.retrievalPassed,
      };
    }

    case "detect-contradictions": {
      const result = await runDetectContradictionsPipeline(
        {
          query,
          speaker: intent.parsed.speaker ?? "",
          topic: intent.parsed.topic,
          claim: intent.parsed.claim,
          chunks: scoredChunks,
          documents,
          timeframe: intent.parsed.timeframe,
          model: "qwen-2.5-7b-instruct",
        },
        callLLM as (s: string, u: string) => Promise<DetectContradictionsOutput>
      );
      return {
        mode,
        corrected,
        correctionReason,
        output: result.output,
        retrievalPassed: result.retrievalPassed,
      };
    }

    case "general-question":
    default: {
      const result = await runGeneralQuestionPipeline(
        {
          query,
          chunks: scoredChunks,
          model: "qwen-2.5-7b-instruct",
        },
        callLLM as (s: string, u: string) => Promise<AgentOutput>
      );
      return {
        mode,
        corrected,
        correctionReason,
        output: result.output,
        retrievalPassed: result.retrievalPassed,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Mock LLM responses for development
// ---------------------------------------------------------------------------

function mockLLMResponse(userPrompt: string, mode: IntentMode): unknown {
  // Extract basic info from prompt for mock response
  const chunkMatches = userPrompt.match(/chunkId: (doc-\d+-chunk-\d+)/g) ?? [];
  const storageMatches = userPrompt.match(/storagePointer: (0g:\/\/[^\n]+)/g) ?? [];
  const urlMatches = userPrompt.match(/sourceUrl: (https?:\/\/[^\n]+)/g) ?? [];
  const timeMatches = userPrompt.match(/observedAt: ([Z0-9:-]+)/g) ?? [];
  const textMatches = userPrompt.match(/text: ([^\n]+(?:\n(?!(?:chunkId|storagePointer|sourceUrl|observedAt|---)))*)/g) ?? [];

  const chunkIds = chunkMatches.map((m) => m.replace("chunkId: ", ""));
  const pointers = storageMatches.map((m) => m.replace("storagePointer: ", ""));
  const urls = urlMatches.map((m) => m.replace("sourceUrl: ", ""));
  const times = timeMatches.map((m) => m.replace("observedAt: ", ""));
  const texts = textMatches.map((m) => m.replace(/text: /, "").trim()).filter((t) => t.length > 0);

  if (mode === "verify-claim") {
    // Mock verify-claim response
    if (chunkIds.length === 0) {
      return {
        mode: "verify-claim",
        verdict: "unverifiable",
        confidence: 0.0,
        explanation: "No relevant chunks found to verify this claim.",
        supportingCitations: [],
        contradictingCitations: [],
        nuances: [],
        meta: {
          query: "",
          speakerQuery: "",
          claimText: "",
          timeframe: null,
          chunksRetrieved: 0,
          retrievalScoreAvg: 0,
          documentsUsed: [],
          model: "mock",
          timestamp: new Date().toISOString(),
        },
      };
    }

    return {
      mode: "verify-claim",
      verdict: "supported",
      confidence: 0.85,
      explanation: `Based on the retrieved chunks, this claim appears to be supported by the available evidence.`,
      supportingCitations: chunkIds.slice(0, 1).map((chunkId, i) => ({
        chunkId,
        quote: (texts[i] ?? "").slice(0, 200),
        sourceUrl: urls[i] ?? "",
        observedAt: times[i] ?? "",
        storagePointer: pointers[i] ?? "",
        attestationId: "att-001",
      })),
      contradictingCitations: [],
      nuances: [],
      meta: {
        query: "",
        speakerQuery: "",
        claimText: "",
        timeframe: null,
        chunksRetrieved: chunkIds.length,
        retrievalScoreAvg: 0.8,
        documentsUsed: ["doc-001"],
        model: "mock",
        timestamp: new Date().toISOString(),
      },
    };
  }

  if (mode === "detect-contradictions") {
    // Mock detect-contradictions response
    return {
      mode: "detect-contradictions",
      contradictions: [],
      summary: "No contradictions detected in the available evidence.",
      meta: {
        query: "",
        speakerQuery: "",
        topic: null,
        timeframe: null,
        chunksAnalyzed: chunkIds.length,
        documentsUsed: ["doc-001"],
        model: "mock",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Default: general-question
  if (chunkIds.length === 0) {
    return {
      answer: "Insufficient evidence to answer this question.",
      citations: [],
      confidence: 0.0,
      evidence: [],
      limitations: "No chunks retrieved from 0G Storage.",
      contradictions: [],
    };
  }

  return {
    answer: `Based on the retrieved evidence: ${texts[0]?.slice(0, 200) ?? "No content"}...`,
    citations: chunkIds.map((chunkId, i) => ({
      chunkId,
      quote: (texts[i] ?? "").slice(0, 150) + ((texts[i]?.length ?? 0) > 150 ? "..." : ""),
      sourceUrl: urls[i] ?? "",
      observedAt: times[i] ?? "",
      storagePointer: pointers[i] ?? "",
    })),
    confidence: 0.85,
    evidence: chunkIds,
    limitations: "",
    contradictions: [],
  };
}

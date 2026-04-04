/**
 * RAG Agent - Main entry point.
 * Orchestrates storage -> retrieval -> LLM -> guardrails.
 */

import type { AgentOutput } from "../../schemas/agent-output";
import { createEmptyOutput, validateAgentOutput } from "../../schemas/agent-output";
import { getStorageAdapter, type IStorageAdapter } from "../storage/0g-adapter";
import type { RetrievedChunk } from "../storage/types";
import { searchChunks } from "../retrieval/search";
import { buildSystemPrompt, buildUserPrompt, buildCitations } from "./prompt-template";
import {
  validateRetrieval,
  validateCitations,
  detectContradictions,
  RETRY_LIMIT,
} from "./guardrails";

export interface AgentConfig {
  topK?: number;
  minScore?: number;
  modelProvider?: "openai" | "anthropic" | "mock";
  modelName?: string;
}

const DEFAULT_CONFIG: AgentConfig = {
  topK: 5,
  minScore: 0.1,
  modelProvider: "mock",
  modelName: "gpt-4o",
};

export interface QueryResult {
  output: AgentOutput;
  retrievedChunks: RetrievedChunk[];
  retrievalPassed: boolean;
  contradictions: string[];
}

let _config: AgentConfig = { ...DEFAULT_CONFIG };
let _storageAdapter: IStorageAdapter | null = null;

export function configureAgent(config: Partial<AgentConfig>): void {
  _config = { ..._config, ...config };
}

export function setStorageAdapter(adapter: IStorageAdapter): void {
  _storageAdapter = adapter;
}

function getAdapter(): IStorageAdapter {
  return _storageAdapter ?? getStorageAdapter();
}

/**
 * Main query endpoint: given a query and optional documentId,
 * retrieves chunks from 0G and produces a cited answer.
 */
export async function query(
  userQuery: string,
  documentId?: string
): Promise<QueryResult> {
  const adapter = getAdapter();
  const { topK, minScore } = _config;

  // Step 1: Fetch chunks from 0G
  let chunks: RetrievedChunk[] = [];

  if (documentId) {
    const allChunks = await adapter.listChunksForDocument(documentId);
    chunks = await searchChunks(userQuery, allChunks, { topK, minScore });
  } else {
    // Search across all documents (if documentId not specified)
    // In production, you'd maintain a document index
    const manifest = await adapter.getManifest("doc-001");
    if (manifest) {
      const allChunks = await adapter.listChunksForDocument(manifest.documentId);
      chunks = await searchChunks(userQuery, allChunks, { topK, minScore });
    }
  }

  // Step 2: Guardrail - check retrieval quality
  const retrievalCheck = validateRetrieval(chunks, topK);
  if (!retrievalCheck.allowed) {
    return {
      output: retrievalCheck.output,
      retrievedChunks: chunks,
      retrievalPassed: false,
      contradictions: [],
    };
  }

  // Step 3: Detect contradictions
  const contradictions = detectContradictions(chunks);

  // Step 4: Build prompt and call LLM
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({ query: userQuery, chunks });

  let output = await callLLM(systemPrompt, userPrompt);

  // Step 5: Validate citations
  let attempts = 0;
  while (attempts < RETRY_LIMIT) {
    const citationCheck = validateCitations(output);
    if (citationCheck.allowed) break;

    // Re-prompt once
    if (attempts === 0) {
      const repromptUser = buildUserPrompt({ query: userQuery, chunks });
      output = await callLLM(
        systemPrompt + "\n\nIMPORTANT: Your previous response was rejected for: " + citationCheck.reason,
        repromptUser
      );
    } else {
      // Give up
      return {
        output: {
          ...createEmptyOutput(),
          limitations: citationCheck.reason,
        },
        retrievedChunks: chunks,
        retrievalPassed: true,
        contradictions,
      };
    }
    attempts++;
  }

  // Final validation
  const finalCheck = validateCitations(output);
  if (!finalCheck.allowed) {
    return {
      output: { ...createEmptyOutput(), limitations: finalCheck.reason },
      retrievedChunks: chunks,
      retrievalPassed: true,
      contradictions,
    };
  }

  // Append contradiction warning if any
  let limitations = output.limitations;
  if (contradictions.length > 0) {
    limitations = limitations
      ? limitations + " Contradictions detected: " + contradictions.join("; ")
      : "Contradictions detected: " + contradictions.join("; ");
  }

  return {
    output: { ...output, limitations },
    retrievedChunks: chunks,
    retrievalPassed: true,
    contradictions,
  };
}

/**
 * Call LLM. Currently mock for development.
 */
async function callLLM(systemPrompt: string, userPrompt: string): Promise<AgentOutput> {
  const { modelProvider } = _config;

  if (modelProvider === "mock") {
    return mockLLMResponse(userPrompt);
  }

  // Placeholder for real LLM calls
  throw new Error(`Model provider ${modelProvider} not implemented. Use 'mock' for development.`);
}

/**
 * Mock LLM that generates a simple response from chunks.
 * Replace with real API call in production.
 */
async function mockLLMResponse(userPrompt: string): Promise<AgentOutput> {
  // Parse chunks from the prompt to extract content
  const chunkMatches = userPrompt.match(/chunkId: (doc-\d+-chunk-\d+)/g) ?? [];
  const storageMatches = userPrompt.match(/storagePointer: (0g:\/\/[^\n]+)/g) ?? [];
  const urlMatches = userPrompt.match(/sourceUrl: (https?:\/\/[^\n]+)/g) ?? [];
  const timeMatches = userPrompt.match(/observedAt: ([Z0-9:-]+)/g) ?? [];
  const textMatches = userPrompt.match(/text: ([^\n]+(?:\n(?!(?:chunkId|storagePointer|sourceUrl|observedAt|---)))*)/g) ?? [];

  const chunkIds = chunkMatches.map((m) => m.replace("chunkId: ", ""));
  const pointers = storageMatches.map((m) => m.replace("storagePointer: ", ""));
  const urls = urlMatches.map((m) => m.replace("sourceUrl: ", ""));
  const times = timeMatches.map((m) => m.replace("observedAt: ", ""));
  const texts = textMatches.map((m) => m.replace(/text: /, "").trim());

  if (chunkIds.length === 0) {
    return {
      ...createEmptyOutput(),
      limitations: "No chunks available for answering.",
    };
  }

  // Generate answer using the first chunk's text
  const firstText = texts[0] ?? "";
  const answer = `Based on the retrieved evidence, ${firstText.slice(0, 200)}...`;

  const citations = chunkIds.map((chunkId, i) => ({
    chunkId,
    quote: (texts[i] ?? "").slice(0, 150) + ((texts[i]?.length ?? 0) > 150 ? "..." : ""),
    sourceUrl: urls[i] ?? "",
    observedAt: times[i] ?? "",
    storagePointer: pointers[i] ?? "",
  }));

  const evidence = chunkIds;

  return {
    answer,
    citations,
    confidence: 0.85,
    evidence,
    limitations: "",
  };
}

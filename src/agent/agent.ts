/**
 * RAG Agent - Main entry point.
 * Orchestrates storage -> retrieval -> 0G Compute LLM -> guardrails.
 */

import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
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

// ---------------------------------------------------------------------------
// 0G Compute broker (initialized via initialize0GProvider)
// ---------------------------------------------------------------------------

interface ServiceMetadata {
  endpoint: string;
  model: string;
}

let _broker: Awaited<ReturnType<typeof createZGComputeNetworkBroker>> | null = null;
let _0gProviderAddress: string | null = null;
let _0gServiceMetadata: ServiceMetadata | null = null;

export interface AgentConfig {
  topK?: number;
  minScore?: number;
  modelProvider?: "openai" | "anthropic" | "mock" | "0g";
  modelName?: string;
  /** 0G Compute: explicit provider address to use (skips service discovery) */
  0gProviderAddress?: string;
  /** 0G Compute: RPC URL override (defaults to testnet) */
  rpcUrl?: string;
}

const DEFAULT_CONFIG: AgentConfig = {
  topK: 5,
  minScore: 0.1,
  modelProvider: "mock",
  modelName: "meta-llama/Llama-3.3-70B-Instruct",
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

/**
 * Initialize the 0G Compute broker and discover/instantiate a service.
 * Call this once before using modelProvider: "0g".
 *
 * @param privateKey - Wallet private key (from env)
 * @param opts - Optional RPC URL override or explicit provider address
 */
export async function initialize0GProvider(
  privateKey: string,
  opts: { rpcUrl?: string; providerAddress?: string } = {}
): Promise<void> {
  const RPC_URL =
    opts.rpcUrl ??
    (process.env.NODE_ENV === "production"
      ? "https://evmrpc.0g.ai"
      : "https://evmrpc-testnet.0g.ai");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  _broker = await createZGComputeNetworkBroker(wallet);

  if (opts.providerAddress) {
    // Use explicitly configured provider
    _0gProviderAddress = opts.providerAddress;
    const metadata = await _broker.inference.getServiceMetadata(opts.providerAddress);
    _0gServiceMetadata = {
      endpoint: metadata.endpoint,
      model: metadata.model,
    };
  } else {
    // Discover first available chatbot service
    const services = await _broker.inference.listService();
    const chatbot = services.find((s) => s.serviceType === "chatbot");
    if (!chatbot) {
      throw new Error("No 0G Compute chatbot service available");
    }
    _0gProviderAddress = chatbot.provider;
    const metadata = await _broker.inference.getServiceMetadata(chatbot.provider);
    _0gServiceMetadata = {
      endpoint: metadata.endpoint,
      model: metadata.model,
    };
  }
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
 * Call LLM. Supports mock for development and 0G Compute for production.
 */
async function callLLM(systemPrompt: string, userPrompt: string): Promise<AgentOutput> {
  const { modelProvider, modelName } = _config;

  if (modelProvider === "mock") {
    return mockLLMResponse(userPrompt);
  }

  if (modelProvider === "0g") {
    if (!_broker || !_0gProviderAddress || !_0gServiceMetadata) {
      throw new Error(
        "0G provider not initialized. Call initialize0GProvider() before using modelProvider: '0g'."
      );
    }

    const { endpoint, model } = _0gServiceMetadata;
    const headers = await _broker.inference.getRequestHeaders(_0gProviderAddress);

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        messages,
        model: modelName ?? model,
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`0G inference request failed (${response.status}): ${text}`);
    }

    // Extract chatID for processResponse (required for fee settlement + TEE verification)
    let chatID =
      response.headers.get("ZG-Res-Key") ||
      response.headers.get("zg-res-key") ||
      undefined;

    const data = await response.json().catch(() => null);
    if (!data) {
      throw new Error("0G inference: failed to parse response JSON");
    }

    chatID ??= data.id;

    const usage = data.usage ?? {};
    // CRITICAL: Always call processResponse for fee settlement + TEE verification
    await _broker.inference.processResponse(
      _0gProviderAddress,
      chatID,
      JSON.stringify(usage)
    );

    const text = data.choices?.[0]?.message?.content ?? "";

    // Parse JSON from model's response (it should return AgentOutput schema)
    try {
      const parsed = JSON.parse(text) as unknown;
      if (validateAgentOutput(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through: return as plain answer with no structured citations
    }

    // Could not parse as AgentOutput — return raw text in answer field
    return {
      ...createEmptyOutput(),
      answer: text,
      limitations: "Model did not return valid AgentOutput JSON. Evidence not validated.",
    };
  }

  // Placeholder for other providers
  throw new Error(
    `Model provider ${modelProvider} not implemented. Use 'mock' for dev or '0g' for production.`
  );
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

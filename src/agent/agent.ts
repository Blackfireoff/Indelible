/**
 * RAG Agent - Main entry point.
 * Uses the multi-mode pipeline with LLM-based intent classification.
 */

import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import { getStorageAdapter, type IStorageAdapter } from "../storage/0g-adapter";
import { getEmbedder } from "../retrieval/embedder";
import type { RetrievedChunk, DocumentManifest } from "../storage/types";
import type { PipelineOutput } from "../pipelines";
import { runPipeline } from "../pipelines";
import type { IntentMode } from "../../schemas/intent-output";

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
  "0gProviderAddress"?: string;
  /** 0G Compute: RPC URL override (defaults to testnet) */
  rpcUrl?: string;
}

const DEFAULT_CONFIG: AgentConfig = {
  topK: 5,
  minScore: 0.1,
  modelProvider: "mock",
  modelName: "qwen-2.5-7b-instruct",
};

export interface QueryResult {
  mode: IntentMode;
  corrected: boolean;
  correctionReason: string;
  output: PipelineOutput;
  retrievalPassed: boolean;
}

let _config: AgentConfig = { ...DEFAULT_CONFIG };
let _storageAdapter: IStorageAdapter | null = null;

export function configureAgent(config: Partial<AgentConfig>): void {
  _config = { ..._config, ...config };
}

/**
 * Initialize the 0G Compute broker and discover/instantiate a service.
 * Call this once before using modelProvider: "0g".
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
    _0gProviderAddress = opts.providerAddress;
    const metadata = await _broker.inference.getServiceMetadata(opts.providerAddress);
    _0gServiceMetadata = {
      endpoint: metadata.endpoint,
      model: metadata.model,
    };
  } else {
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
 * uses LLM intent classification + mode-specific pipelines.
 */
export async function query(
  userQuery: string,
  documentId?: string
): Promise<QueryResult> {
  const adapter = getAdapter();
  const embedder = getEmbedder();
  const { topK, minScore, modelProvider, modelName } = _config;

  // Build LLM call function based on provider
  const llmCall = buildLLMCall(modelProvider, modelName);

  // Build documentIds array
  const documentIds = documentId ? [documentId] : [];

  // Run the pipeline with intent classification
  const result = await runPipeline(
    userQuery,
    documentIds,
    {
      getManifest: async (docId: string) => adapter.getManifest(docId),
      listChunksForDocument: async (docId: string) => adapter.listChunksForDocument(docId),
      getEmbeddings: async (docId: string) => adapter.getEmbeddings(docId),
    },
    {
      embed: (text: string) => embedder.embed(text),
    },
    { topK, minScore },
    llmCall
  );

  return {
    mode: result.mode,
    corrected: result.corrected,
    correctionReason: result.correctionReason,
    output: result.output,
    retrievalPassed: result.retrievalPassed,
  };
}

/**
 * Build LLM call function based on provider.
 */
function buildLLMCall(
  modelProvider: string,
  modelName: string | undefined
): (systemPrompt: string, userPrompt: string) => Promise<unknown> {
  return async (systemPrompt: string, userPrompt: string): Promise<unknown> => {
    if (modelProvider === "mock") {
      return mockLLMResponse(systemPrompt, userPrompt);
    }

    if (modelProvider === "0g") {
      return call0GInference(systemPrompt, userPrompt, modelName);
    }

    throw new Error(
      `Model provider ${modelProvider} not implemented. Use 'mock' for dev or '0g' for production.`
    );
  };
}

/**
 * Call 0G Compute inference.
 */
async function call0GInference(
  systemPrompt: string,
  userPrompt: string,
  modelName: string | undefined
): Promise<unknown> {
  if (!_broker || !_0gProviderAddress || !_0gServiceMetadata) {
    throw new Error(
      "0G provider not initialized. Call initialize0GProvider() before using modelProvider: '0g'."
    );
  }

  const { endpoint, model } = _0gServiceMetadata;
  const headers = await _broker.inference.getRequestHeaders(_0gProviderAddress);

  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
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

  // Try to parse as JSON
  try {
    return JSON.parse(text);
  } catch {
    // Return raw text wrapped in basic structure
    return {
      answer: text,
      citations: [],
      confidence: 0.0,
      evidence: [],
      limitations: "Model did not return valid JSON.",
      contradictions: [],
    };
  }
}

/**
 * Mock LLM that generates responses based on prompt content.
 */
async function mockLLMResponse(systemPrompt: string, userPrompt: string): Promise<unknown> {
  // Detect which pipeline is being called based on system prompt content
  const isIntentClassification = systemPrompt.includes("intent classifier") || systemPrompt.includes("INTENT CLASSIFIER");
  const isVerifyClaim = systemPrompt.includes("VERIFY") || systemPrompt.includes("verify-claim");
  const isDetectContradictions = systemPrompt.includes("CONTRADICTION") || systemPrompt.includes("contradiction");

  if (isIntentClassification) {
    // Parse query for intent classification
    const queryMatch = userPrompt.match(/USER QUERY: (.+?)(?:\n|$)/i);
    const query = queryMatch ? queryMatch[1].toLowerCase() : "";

    if (query.includes("contradiction")) {
      return JSON.stringify({
        mode: "detect-contradictions",
        confidence: 0.9,
        parsed: { speaker: "Trump", claim: null, topic: "tariffs", timeframe: null },
      });
    } else if (query.includes("did") || query.includes("is it true") || query.includes("was")) {
      return JSON.stringify({
        mode: "verify-claim",
        confidence: 0.9,
        parsed: { speaker: "Trump", claim: "tariffs are working", topic: "tariffs", timeframe: null },
      });
    } else {
      return JSON.stringify({
        mode: "general-question",
        confidence: 0.8,
        parsed: { speaker: "Trump", claim: null, topic: "tariffs", timeframe: null },
      });
    }
  }

  // Pipeline responses
  if (isVerifyClaim) {
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

  if (isDetectContradictions) {
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

  // Default: general-question response
  const chunkMatches = userPrompt.match(/chunkId: (doc-\d+-chunk-\d+)/g) ?? [];
  const storageMatches = userPrompt.match(/storagePointer: (0g:\/\/[^\n]+)/g) ?? [];
  const urlMatches = userPrompt.match(/sourceUrl: (https?:\/\/[^\n]+)/g) ?? [];
  const timeMatches = userPrompt.match(/observedAt: ([Z0-9:-]+)/g) ?? [];
  const textMatches = userPrompt.match(/text: ([^\n]+)/g) ?? [];

  const chunkIds = chunkMatches.map((m) => m.replace("chunkId: ", ""));
  const pointers = storageMatches.map((m) => m.replace("storagePointer: ", ""));
  const urls = urlMatches.map((m) => m.replace("sourceUrl: ", ""));
  const times = timeMatches.map((m) => m.replace("observedAt: ", ""));
  const texts = textMatches.map((m) => m.replace(/text: /, "").trim()).filter((t) => t.length > 0);

  const firstText = texts[0] ?? "";
  const answer = `Based on the retrieved evidence, ${firstText.slice(0, 200)}...`;

  return {
    answer,
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

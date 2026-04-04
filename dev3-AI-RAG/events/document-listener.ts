/**
 * Document Event Listener
 *
 * Listens to the 0G Storage Flow contract for Submit events, which are emitted
 * when documents are uploaded. When dev2 uploads a batch of documents (typically 5),
 * the 4th document contains precomputed embeddings that need to be stored locally.
 *
 * Usage:
 *   const listener = await DocumentEventListener.create({
 *     rpcUrl: "https://evmrpc-testnet.0g.ai",
 *     flowContractAddress: "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296",
 *   });
 *   await listener.start();
 *
 * The listener will:
 * 1. Listen for Submit events from the Flow contract
 * 2. Track document submissions and identify batches
 * 3. When an embeddings document is detected, download and store locally
 * 4. Emit events to notify subscribers of new available data
 */

import { ethers } from "ethers";
import type { EmbeddingsFile, EmbeddingVector } from "../storage/types";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface DocumentSubmittedEvent {
  sender: string;
  identity: string;
  submissionIndex: bigint;
  startPos: bigint;
  length: bigint;
  rootHash: string;
  blockNumber: number;
  blockTimestamp: number;
}

export interface EmbeddingsLoadedEvent {
  documentId: string;
  attestationId: string;
  chunkCount: number;
  vectors: EmbeddingVector[];
  model: {
    provider: string;
    model: string;
    dimension: number;
  };
}

export interface BatchCompleteEvent {
  batchId: string;
  totalDocuments: number;
  embeddingsDocumentIndex: number;
  documentIds: string[];
  attestationIds: string[];
}

export type DocumentEventType =
  | "document-submitted"
  | "embeddings-loaded"
  | "batch-complete"
  | "error";

export interface DocumentEvent {
  type: DocumentEventType;
  data: DocumentSubmittedEvent | EmbeddingsLoadedEvent | BatchCompleteEvent | string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface DocumentListenerConfig {
  /** RPC URL for 0G testnet */
  rpcUrl?: string;
  /** Flow contract address (defaults to testnet) */
  flowContractAddress?: string;
  /** Size of document batch before triggering batch complete */
  batchSize?: number;
  /** Index of document in batch that contains embeddings (0-based, default 3 = 4th) */
  embeddingsDocumentIndex?: number;
  /** Path to local vector store file */
  vectorStorePath?: string;
  /** Callback for events */
  onEvent?: (event: DocumentEvent) => void;
}

// ---------------------------------------------------------------------------
// Flow contract ABI (only events needed)
// ---------------------------------------------------------------------------

const FLOW_CONTRACT_ABI = [
  "event Submit(address indexed sender, bytes32 indexed identity, uint256 submissionIndex, uint256 startPos, uint256 length, tuple(bytes32 root, uint256 height)[] nodes)",
];

// ---------------------------------------------------------------------------
// Document Event Listener
// ---------------------------------------------------------------------------

export class DocumentEventListener {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly flowContract: ethers.Contract;
  private readonly batchSize: number;
  private readonly embeddingsDocumentIndex: number;
  private readonly vectorStorePath: string;
  private readonly onEvent?: (event: DocumentEvent) => void;

  private isListening = false;
  private documentBatch: Array<{
    event: DocumentSubmittedEvent;
    rootHash: string;
  }> = [];
  private batchIdCounter = 0;

  // In-memory vector store for fast retrieval
  private vectorsByChunkId: Map<string, EmbeddingVector> = new Map();
  private vectorsByDocumentId: Map<string, EmbeddingVector[]> = new Map();

  private constructor(config: DocumentListenerConfig) {
    const rpcUrl =
      config.rpcUrl ?? process.env.ZEROG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";

    const flowAddress =
      config.flowContractAddress ??
      process.env.FLOW_CONTRACT_ADDRESS ??
      "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296";

    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    this.flowContract = new ethers.Contract(flowAddress, FLOW_CONTRACT_ABI, this.provider);

    this.batchSize = config.batchSize ?? 5;
    this.embeddingsDocumentIndex = config.embeddingsDocumentIndex ?? 3;
    this.vectorStorePath =
      config.vectorStorePath ?? "./data/local-vectors.json";
    this.onEvent = config.onEvent;
  }

  /**
   * Factory method to create and optionally initialize the listener
   */
  static async create(config: DocumentListenerConfig = {}): Promise<DocumentEventListener> {
    const listener = new DocumentEventListener(config);
    await listener.initialize();
    return listener;
  }

  /**
   * Initialize the listener - load existing vectors if available
   */
  private async initialize(): Promise<void> {
    await this.loadLocalVectors();
    console.log("[DocumentListener] Initialized");
    console.log(`  RPC: ${await this.provider.getNetwork().then(n => n.chainId)}`);
    console.log(`  Flow: ${await this.flowContract.getAddress()}`);
    console.log(`  Batch size: ${this.batchSize}`);
    console.log(`  Embeddings index: ${this.embeddingsDocumentIndex}`);
    console.log(`  Local vectors loaded: ${this.vectorsByChunkId.size}`);
  }

  /**
   * Start listening for Submit events
   */
  async start(): Promise<void> {
    if (this.isListening) {
      console.warn("[DocumentListener] Already listening");
      return;
    }

    console.log("[DocumentListener] Starting event listener...");
    this.isListening = true;

    // Listen for new Submit events
    this.flowContract.on(
      "Submit",
      this.handleSubmitEvent.bind(this)
    );

    console.log("[DocumentListener] Listening for Submit events...");
  }

  /**
   * Stop listening for events
   */
  async stop(): Promise<void> {
    if (!this.isListening) return;

    console.log("[DocumentListener] Stopping event listener...");
    this.flowContract.removeAllListeners("Submit");
    this.isListening = false;
    console.log("[DocumentListener] Stopped");
  }

  /**
   * Query historical Submit events (e.g., on startup to catch up)
   */
  async queryHistoricalEvents(fromBlock: number, toBlock?: number): Promise<DocumentSubmittedEvent[]> {
    const currentBlock = await this.provider.getBlockNumber();
    const endBlock = toBlock ?? currentBlock;

    console.log(`[DocumentListener] Querying historical events from block ${fromBlock} to ${endBlock}...`);

    const filter = this.flowContract.filters.Submit();
    const events = await this.flowContract.queryFilter(filter, fromBlock, endBlock);

    const submittedEvents: DocumentSubmittedEvent[] = [];

    for (const event of events) {
      const parsed = event as ethers.EventLog;
      if (parsed.args) {
        const docEvent: DocumentSubmittedEvent = {
          sender: parsed.args[0] as string,
          identity: parsed.args[1] as string,
          submissionIndex: parsed.args[2] as bigint,
          startPos: parsed.args[3] as bigint,
          length: parsed.args[4] as bigint,
          rootHash: (parsed.args[5] as Array<{ root: string }>)?.[0]?.root ?? "",
          blockNumber: parsed.blockNumber,
          blockTimestamp: (await parsed.getBlock()).timestamp,
        };
        submittedEvents.push(docEvent);
        await this.handleSubmitEventInternal(docEvent);
      }
    }

    console.log(`[DocumentListener] Processed ${submittedEvents.length} historical events`);
    return submittedEvents;
  }

  /**
   * Handle incoming Submit event
   */
  private async handleSubmitEvent(
    sender: string,
    identity: string,
    submissionIndex: bigint,
    startPos: bigint,
    length: bigint,
    nodes: Array<{ root: string; height: bigint }>,
    ...extra: unknown[]
  ): Promise<void> {
    // Extract block info from the log
    const log = extra[0] as ethers.EventLog | undefined;
    const blockNumber = log?.blockNumber ?? 0;
    const blockTimestamp = log ? await this.provider.getBlock(blockNumber).then(b => b?.timestamp ?? 0) : 0;

    const rootHash = nodes?.[0]?.root ?? "";

    const docEvent: DocumentSubmittedEvent = {
      sender,
      identity,
      submissionIndex,
      startPos,
      length,
      rootHash,
      blockNumber,
      blockTimestamp,
    };

    this.emit("document-submitted", docEvent);
    await this.handleSubmitEventInternal(docEvent);
  }

  /**
   * Internal handler for submit events
   */
  private async handleSubmitEventInternal(event: DocumentSubmittedEvent): Promise<void> {
    console.log(`[DocumentListener] Document submitted: ${event.rootHash.slice(0, 16)}... (from ${event.sender.slice(0, 8)}...)`);

    // Add to batch
    this.documentBatch.push({
      event,
      rootHash: event.rootHash,
    });

    // Check if this is the embeddings document (4th in batch)
    if (this.documentBatch.length === this.embeddingsDocumentIndex + 1) {
      console.log(`[DocumentListener] Embeddings document detected at index ${this.embeddingsDocumentIndex}`);
      await this.handleEmbeddingsDocument(event);
    }

    // Check if batch is complete
    if (this.documentBatch.length === this.batchSize) {
      await this.handleBatchComplete();
    }
  }

  /**
   * Handle the embeddings document (download and store locally)
   */
  private async handleEmbeddingsDocument(submitEvent: DocumentSubmittedEvent): Promise<void> {
    try {
      console.log(`[DocumentListener] Downloading embeddings from root: ${submitEvent.rootHash}...`);

      // Download the embeddings from 0G Storage
      const embeddingsData = await this.downloadFrom0G(submitEvent.rootHash);
      const embeddings: EmbeddingsFile = JSON.parse(embeddingsData);

      console.log(`[DocumentListener] Loaded embeddings: ${embeddings.vectors.length} vectors, model: ${embeddings.embeddingModel.model}`);

      // Extract document ID from the embeddings metadata
      const documentId = this.extractDocumentId(embeddings);
      const attestationId = embeddings.attestationId;

      // Store vectors locally
      for (const vector of embeddings.vectors) {
        this.vectorsByChunkId.set(vector.chunkId, vector);
      }
      this.vectorsByDocumentId.set(documentId, embeddings.vectors);

      // Persist to local storage
      await this.saveLocalVectors();

      // Emit event
      this.emit("embeddings-loaded", {
        documentId,
        attestationId,
        chunkCount: embeddings.vectors.length,
        vectors: embeddings.vectors,
        model: embeddings.embeddingModel,
      });

      console.log(`[DocumentListener] Stored ${embeddings.vectors.length} vectors for document ${documentId}`);
    } catch (error) {
      console.error("[DocumentListener] Failed to handle embeddings document:", error);
      this.emit("error", `Failed to handle embeddings: ${error}`);
    }
  }

  /**
   * Handle batch complete
   */
  private async handleBatchComplete(): Promise<void> {
    const batchId = `batch-${++this.batchIdCounter}-${Date.now()}`;

    const batchEvent: BatchCompleteEvent = {
      batchId,
      totalDocuments: this.documentBatch.length,
      embeddingsDocumentIndex: this.embeddingsDocumentIndex,
      documentIds: this.documentBatch.map((_, i) => `doc-${this.batchIdCounter}-${i + 1}`),
      attestationIds: [], // Would be extracted from the actual documents
    };

    console.log(`[DocumentListener] Batch complete: ${batchId}`);
    this.emit("batch-complete", batchEvent);

    // Clear the batch
    this.documentBatch = [];
  }

  /**
   * Download data from 0G Storage
   */
  private async downloadFrom0G(rootHash: string): Promise<string> {
    const { Indexer } = await import("@0glabs/0g-ts-sdk");

    const indexerUrl =
      process.env.ZEROG_INDEXER_URL ?? "https://indexer-storage-testnet-turbo.0g.ai";

    const indexer = new Indexer(indexerUrl);
    const tmpPath = `/tmp/indelible_emb_${rootHash.slice(0, 16)}.json`;

    try {
      const err = await indexer.download(rootHash, tmpPath, true);
      if (err !== null) {
        throw new Error(`0G download error: ${err}`);
      }

      const { readFileSync, unlinkSync } = await import("fs");
      const data = readFileSync(tmpPath, "utf-8");
      unlinkSync(tmpPath);
      return data;
    } catch (error) {
      console.error("[DocumentListener] Download failed:", error);
      throw error;
    }
  }

  /**
   * Extract document ID from embeddings file
   */
  private extractDocumentId(embeddings: EmbeddingsFile): string {
    // Try to extract from first vector's metadata
    const firstVector = embeddings.vectors[0];
    if (firstVector?.metadata?.attestationId) {
      // Use attestation ID as document ID prefix
      return `doc-${firstVector.metadata.attestationId.slice(0, 8)}`;
    }
    return `doc-${Date.now()}`;
  }

  /**
   * Load vectors from local storage
   */
  private async loadLocalVectors(): Promise<void> {
    try {
      const { readFileSync, existsSync } = await import("fs");
      if (!existsSync(this.vectorStorePath)) {
        console.log("[DocumentListener] No existing vector store found");
        return;
      }

      const data = readFileSync(this.vectorStorePath, "utf-8");
      const stored = JSON.parse(data);

      if (stored.vectorsByChunkId) {
        for (const [chunkId, vector] of Object.entries(stored.vectorsByChunkId)) {
          this.vectorsByChunkId.set(chunkId, vector as EmbeddingVector);
        }
      }

      if (stored.vectorsByDocumentId) {
        for (const [docId, vectors] of Object.entries(stored.vectorsByDocumentId)) {
          this.vectorsByDocumentId.set(docId, vectors as EmbeddingVector[]);
        }
      }

      console.log(`[DocumentListener] Loaded ${this.vectorsByChunkId.size} vectors from local store`);
    } catch (error) {
      console.warn("[DocumentListener] Failed to load local vectors:", error);
    }
  }

  /**
   * Save vectors to local storage
   */
  private async saveLocalVectors(): Promise<void> {
    try {
      const { writeFileSync, mkdirSync, existsSync } = await import("fs");

      // Ensure directory exists
      const dir = this.vectorStorePath.includes("/")
        ? this.vectorStorePath.substring(0, this.vectorStorePath.lastIndexOf("/"))
        : ".";

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data = {
        savedAt: new Date().toISOString(),
        vectorsByChunkId: Object.fromEntries(this.vectorsByChunkId),
        vectorsByDocumentId: Object.fromEntries(this.vectorsByDocumentId),
      };

      writeFileSync(this.vectorStorePath, JSON.stringify(data, null, 2));
      console.log(`[DocumentListener] Saved ${this.vectorsByChunkId.size} vectors to ${this.vectorStorePath}`);
    } catch (error) {
      console.error("[DocumentListener] Failed to save local vectors:", error);
    }
  }

  /**
   * Emit an event
   */
  private emit(type: DocumentEventType, data: DocumentEvent["data"]): void {
    const event: DocumentEvent = {
      type,
      data,
      timestamp: Date.now(),
    };
    this.onEvent?.(event);
  }

  // -------------------------------------------------------------------------
  // Public query methods
  // -------------------------------------------------------------------------

  /**
   * Get vector for a specific chunk
   */
  getVector(chunkId: string): EmbeddingVector | undefined {
    return this.vectorsByChunkId.get(chunkId);
  }

  /**
   * Get all vectors for a document
   */
  getVectorsForDocument(documentId: string): EmbeddingVector[] {
    return this.vectorsByDocumentId.get(documentId) ?? [];
  }

  /**
   * Check if we have vectors for a chunk
   */
  hasVector(chunkId: string): boolean {
    return this.vectorsByChunkId.has(chunkId);
  }

  /**
   * Get all stored document IDs
   */
  getStoredDocumentIds(): string[] {
    return Array.from(this.vectorsByDocumentId.keys());
  }

  /**
   * Get total vector count
   */
  getVectorCount(): number {
    return this.vectorsByChunkId.size;
  }
}

// ---------------------------------------------------------------------------
// Default instance management
// ---------------------------------------------------------------------------

let _defaultListener: DocumentEventListener | null = null;

export async function startDocumentListener(
  config: DocumentListenerConfig = {}
): Promise<DocumentEventListener> {
  if (_defaultListener) {
    await _defaultListener.stop();
  }

  _defaultListener = await DocumentEventListener.create(config);
  await _defaultListener.start();

  // Optionally catch up on historical events
  const fromBlock = config.batchSize ? await getLastProcessedBlock() : undefined;
  if (fromBlock !== undefined) {
    await _defaultListener.queryHistoricalEvents(fromBlock);
  }

  return _defaultListener;
}

export async function stopDocumentListener(): Promise<void> {
  if (_defaultListener) {
    await _defaultListener.stop();
    _defaultListener = null;
  }
}

export function getDocumentListener(): DocumentEventListener | null {
  return _defaultListener;
}

// Placeholder for block tracking (in production, use a persistent store)
async function getLastProcessedBlock(): Promise<number | undefined> {
  // Would normally read from a file or database
  return undefined; // Start from current block if no record
}

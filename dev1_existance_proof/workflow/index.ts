/**
 * Indelible — CRE Workflow Entry Point
 *
 * This is the Chainlink CRE workflow that listens for SourceAttestationRequested
 * events on the 0G Galileo testnet (chain ID 16602) and orchestrates:
 *   1. Decoding the request event
 *   2. Fetching the raw content from the URL
 *   3. Computing a deterministic content hash
 *   4. Storing the raw artifact in 0G
 *   5. Writing the attestation onchain to SourceAttestationRegistry
 */

import {
  EVMClient,
  handler,
  bytesToHex,
  getNetwork,
  Runner,
  hexToBase64,
  type Runtime,
  type EVMLog,
} from "@chainlink/cre-sdk";
import { keccak256, toBytes, encodeFunctionData, parseAbi } from "viem";

import { decodeRequestEvent, handleSourceRequested, type HandlerConfig } from "./handlers/onSourceRequested";
import * as dotenv from "dotenv";
dotenv.config();

import { Mock0GStorageAdapter } from "./adapters/storage/Mock0GStorageAdapter";
import { Sdk0GStorageAdapter } from "./adapters/storage/Sdk0GStorageAdapter";
import type { StorageAdapter } from "./adapters/storage/StorageAdapter";

// ──────────────────────────────────────────────
//  Configuration
// ──────────────────────────────────────────────

type Config = HandlerConfig & {
  attestationRegistryAddress: string;
};

// ──────────────────────────────────────────────
//  ABI for onchain write
// ──────────────────────────────────────────────

const attestationRegistryAbi = parseAbi([
  "function recordAttestation(bytes32 attestationId, bytes32 requestId, string url, bytes32 rawHash, string dataAddress, uint64 observedAt, string contentType)",
]);

// ──────────────────────────────────────────────
//  Event signature for filtering
// ──────────────────────────────────────────────

const SOURCE_ATTESTATION_REQUESTED_SIG = keccak256(
  toBytes("SourceAttestationRequested(bytes32,address,string,uint64)")
);

// ──────────────────────────────────────────────
//  CRE Workflow Handler
// ──────────────────────────────────────────────

const onLogTrigger = async (runtime: Runtime<Config>, log: EVMLog): Promise<string> => {
  runtime.log(`[Indelible] Log received from ${bytesToHex(log.address)}`);

  // Fetch secrets asynchronously from the CRE runtime/vault
  const [pkRes, rpcRes, idxRes] = await Promise.all([
    runtime.getSecret({ id: "ZG_PRIVATE_KEY" }),
    runtime.getSecret({ id: "ZG_RPC_URL" }),
    runtime.getSecret({ id: "ZG_INDEXER_URL" }),
  ]);

  // Initialize storage adapter using the decrypted secrets
  const storageAdapter: StorageAdapter = new Sdk0GStorageAdapter({
    privateKey: pkRes.result().value || "",
    rpcUrl: rpcRes.result().value,
    indexerUrl: idxRes.result().value,
  });

  // Decode the event
  const event = decodeRequestEvent(log);
  runtime.log(`[Indelible] Request ID: ${event.requestId}`);
  runtime.log(`[Indelible] URL: ${event.url}`);

  // Run the full attestation pipeline (fetching -> hashing -> 0G)
  const attestation = await handleSourceRequested(event, storageAdapter, runtime);

  // Encode the onchain write calldata for the Attestation Registry
  const calldata = encodeFunctionData({
    abi: attestationRegistryAbi,
    functionName: "recordAttestation",
    args: [
      attestation.attestationId as `0x${string}`,
      attestation.requestId as `0x${string}`,
      attestation.url,
      attestation.raw_hash as `0x${string}`,
      attestation.data_address,
      BigInt(attestation.observed_at),
      attestation.content_type,
    ],
  });

  runtime.log(`[Indelible] Attestation calldata ready (${calldata.length} bytes)`);
  runtime.log(`[Indelible] Attestation ID: ${attestation.attestationId}`);

  // Return the calldata. In a real deployment, the CRE forwarder handles the write.
  return JSON.stringify({
    attestationId: attestation.attestationId,
    target: runtime.config.attestationRegistryAddress,
    calldata,
  });
};

// ──────────────────────────────────────────────
//  Workflow initialization
// ──────────────────────────────────────────────

const initWorkflow = (config: Config) => {
  // 0G Galileo testnet — chain ID 16602
  // Note: The chainSelectorName must match the CRE network registry.
  // For hackathon purposes, we use the configured name.
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found: ${config.chainSelectorName}`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);

  return [
    handler(
      evmClient.logTrigger({
        // Listen on the SourceRequestRegistry contract
        addresses: [hexToBase64(config.contractAddress)],
        // Filter for SourceAttestationRequested events only
        topics: [
          { values: [hexToBase64(SOURCE_ATTESTATION_REQUESTED_SIG)] },
        ],
        // Wait for finality to avoid reorgs
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onLogTrigger
    ),
  ];
};

// ──────────────────────────────────────────────
//  Entry point
// ──────────────────────────────────────────────

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

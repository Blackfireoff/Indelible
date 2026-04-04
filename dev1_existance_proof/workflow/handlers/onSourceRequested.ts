import { bytesToHex, type Runtime, type EVMLog } from "@chainlink/cre-sdk";
import { decodeEventLog, parseAbi, type Hex } from "viem";

import type { SourceRequestEvent, RawArtifact, OnchainAttestation } from "../types";
import type { StorageAdapter } from "../adapters/storage/StorageAdapter";
import { fetchRawContent } from "../adapters/http/fetchRawContent";
import { computeRawHash } from "../utils/hashing";
import { computeAttestationId } from "../utils/ids";
import { extractMimeType } from "../utils/mime";

// ABI for decoding the SourceAttestationRequested event
const requestEventAbi = parseAbi([
  "event SourceAttestationRequested(bytes32 indexed requestId, address indexed requester, string url, uint64 requestedAt)",
]);

/**
 * Configuration passed to the handler at runtime.
 */
export type HandlerConfig = {
  chainSelectorName: string;
  contractAddress: string;
};

/**
 * Decode an EVM log into a SourceRequestEvent.
 */
export function decodeRequestEvent(log: EVMLog): SourceRequestEvent {
  const topics = log.topics.map((topic) => bytesToHex(topic)) as [
    `0x${string}`,
    ...`0x${string}`[]
  ];
  const data = bytesToHex(log.data);

  const decoded = decodeEventLog({
    abi: requestEventAbi,
    data,
    topics,
  }) as any;

  const { requestId, requester, url, requestedAt } = decoded.args as {
    requestId: Hex;
    requester: Hex;
    url: string;
    requestedAt: bigint;
  };

  return {
    requestId: requestId as string,
    requester: requester as string,
    url,
    requestedAt: Number(requestedAt),
  };
}

/**
 * Main handler for the SourceAttestationRequested event.
 *
 * Orchestration steps:
 * 1. Decode the event
 * 2. Fetch the raw content from the URL
 * 3. Compute the deterministic raw hash
 * 4. Compute the attestation ID
 * 5. Build the raw artifact
 * 6. Store the raw artifact in 0G via the storage adapter
 * 7. Build and return the onchain attestation payload
 *
 * The CRE workflow entry point calls this handler and then writes
 * the attestation onchain.
 */
export async function handleSourceRequested(
  event: SourceRequestEvent,
  storage: StorageAdapter,
  runtime?: Runtime<HandlerConfig>
): Promise<OnchainAttestation> {
  runtime?.log(`[CRE] Processing request ${event.requestId} for URL: ${event.url}`);

  // Step 1: Fetch the raw content
  runtime?.log(`[CRE] Fetching content from ${event.url}`);
  const fetchResult = await fetchRawContent(event.url);
  runtime?.log(`[CRE] Fetched ${fetchResult.body.length} bytes, status ${fetchResult.status}`);

  // Step 2: Record the observation timestamp
  const observedAt = BigInt(Math.floor(Date.now() / 1000));
  const observedAtIso = new Date(Number(observedAt) * 1000).toISOString();

  // Step 3: Compute deterministic raw hash (no normalization)
  const rawHash = computeRawHash(fetchResult.body);
  runtime?.log(`[CRE] Raw hash: ${rawHash}`);

  // Step 4: Extract content type
  const contentType = extractMimeType(fetchResult.contentType);
  runtime?.log(`[CRE] Content type: ${contentType}`);

  // Step 5: Compute attestation ID
  const attestationId = computeAttestationId(event.url, observedAt, rawHash);
  runtime?.log(`[CRE] Attestation ID: ${attestationId}`);

  // Step 6: Build the raw artifact
  const rawArtifact: RawArtifact = {
    attestationId,
    requestId: event.requestId,
    url: event.url,
    observed_at: observedAtIso,
    content_type: contentType,
    raw_hash: rawHash,
    data_brut: fetchResult.body,
  };

  // Step 7: Store in 0G
  runtime?.log(`[CRE] Storing raw artifact in 0G...`);
  const dataAddress = await storage.putRawArtifact(rawArtifact);
  runtime?.log(`[CRE] Stored at: ${dataAddress}`);

  // Step 8: Build the onchain attestation payload
  const attestation: OnchainAttestation = {
    attestationId,
    requestId: event.requestId,
    url: event.url,
    raw_hash: rawHash,
    data_address: dataAddress,
    observed_at: Number(observedAt),
    content_type: contentType,
  };

  runtime?.log(`[CRE] Attestation ready for onchain write`);
  return attestation;
}

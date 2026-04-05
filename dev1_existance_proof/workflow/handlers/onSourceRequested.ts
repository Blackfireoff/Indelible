import type { RawArtifact } from "../types/RawArtifact";
import type { OnchainAttestation } from "../types/OnchainAttestation";
import type { StorageAdapter } from "../adapters/storage/StorageAdapter";
import { fetchRawContent } from "../adapters/http/fetchRawContent";
import { computeRawHash } from "../utils/hashing";
import { computeAttestationId } from "../utils/ids";
import { extractMimeType } from "../utils/mime";

/**
 * Main handler to process a URL directly.
 *
 * Orchestration steps:
 * 1. Fetch the raw content from the URL
 * 2. Record timestamp
 * 3. Compute the deterministic raw hash
 * 4. Compute the attestation ID
 * 5. Build the raw artifact
 * 6. Store the raw artifact in 0G via the storage adapter
 * 7. Return the attestation payload
 */
export async function processUrl(
  url: string,
  storage: StorageAdapter
): Promise<OnchainAttestation> {
  console.log(`[Workflow] Processing request for URL: ${url}`);

  // Step 1: Fetch the raw content
  console.log(`[Workflow] Fetching content from ${url}`);
  const fetchResult = await fetchRawContent(url);
  console.log(`[Workflow] Fetched ${fetchResult.body.length} bytes, status ${fetchResult.status}`);

  // Step 2: Record the observation timestamp
  const observedAt = BigInt(Math.floor(Date.now() / 1000));
  const observedAtIso = new Date(Number(observedAt) * 1000).toISOString();

  // Step 3: Compute deterministic raw hash (no normalization)
  const rawHash = computeRawHash(fetchResult.body);
  console.log(`[Workflow] Raw hash: ${rawHash}`);

  // Step 4: Extract content type
  const contentType = extractMimeType(fetchResult.contentType);
  console.log(`[Workflow] Content type: ${contentType}`);

  // Step 5: Compute attestation ID
  const attestationId = computeAttestationId(url, observedAt, rawHash);
  console.log(`[Workflow] Attestation ID: ${attestationId}`);

  // Step 6: Build the raw artifact
  // Since there is no requester, we omit requestId or set it to a placeholder.
  const rawArtifact: RawArtifact = {
    attestationId,
    requestId: "direct-request",
    url: url,
    observed_at: observedAtIso,
    content_type: contentType,
    raw_hash: rawHash,
    data_brut: fetchResult.body,
  };

  // Step 7: Store in 0G
  console.log(`[Workflow] Storing raw artifact in 0G...`);
  const dataAddress = await storage.putRawArtifact(rawArtifact);
  console.log(`[Workflow] Stored at: ${dataAddress}`);

  // Step 8: Build the attestation payload
  const attestation: OnchainAttestation = {
    attestationId,
    requestId: "direct-request",
    url: url,
    raw_hash: rawHash,
    data_address: dataAddress,
    observed_at: Number(observedAt),
    content_type: contentType,
  };

  console.log(`[Workflow] Attestation ready`);
  return attestation;
}


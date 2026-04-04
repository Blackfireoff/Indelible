import { keccak256, encodePacked } from "viem";

/**
 * Compute the requestId exactly as the SourceRequestRegistry contract does:
 *   requestId = keccak256(abi.encodePacked(requester, url, requestedAt))
 *
 * @param requester - Address of the requester (0x-prefixed)
 * @param url - The URL submitted for attestation
 * @param requestedAt - Unix timestamp (seconds)
 * @returns The requestId as a 0x-prefixed bytes32 hex string
 */
export function computeRequestId(
  requester: `0x${string}`,
  url: string,
  requestedAt: bigint
): `0x${string}` {
  return keccak256(
    encodePacked(
      ["address", "string", "uint64"],
      [requester, url, requestedAt]
    )
  );
}

/**
 * Compute the attestationId for a source attestation:
 *   attestationId = keccak256(abi.encodePacked(url, observedAt, rawHash))
 *
 * @param url - The original URL
 * @param observedAt - Unix timestamp (seconds) when content was fetched
 * @param rawHash - The keccak256 hash of the raw content
 * @returns The attestationId as a 0x-prefixed bytes32 hex string
 */
export function computeAttestationId(
  url: string,
  observedAt: bigint,
  rawHash: `0x${string}`
): `0x${string}` {
  return keccak256(
    encodePacked(
      ["string", "uint64", "bytes32"],
      [url, observedAt, rawHash]
    )
  );
}

import crypto from "crypto";

/**
 * Compute the attestationId for a source attestation:
 *   attestationId = sha256(url + observedAt + rawHash)
 *
 * @param url - The original URL
 * @param observedAt - Unix timestamp (seconds) when content was fetched
 * @param rawHash - The sha256 hash of the raw content
 * @returns The attestationId as a hex string
 */
export function computeAttestationId(
  url: string,
  observedAt: bigint,
  rawHash: string
): string {
  return crypto.createHash('sha256')
    .update(`${url}${observedAt}${rawHash}`)
    .digest('hex');
}


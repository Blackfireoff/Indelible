import { keccak256, toBytes } from "viem";

/**
 * Compute a deterministic hash of the exact raw content.
 *
 * IMPORTANT: No normalization, prettification, whitespace changes, or tag stripping.
 * This is a capture proof — the hash must match the exact bytes fetched.
 *
 * @param rawContent - The exact raw response body as a string
 * @returns The keccak256 hash as a 0x-prefixed hex string
 */
export function computeRawHash(rawContent: string): `0x${string}` {
  return keccak256(toBytes(rawContent));
}

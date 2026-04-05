import crypto from "crypto";

/**
 * Compute a deterministic hash of the exact raw content.
 *
 * IMPORTANT: No normalization, prettification, whitespace changes, or tag stripping.
 * This is a capture proof — the hash must match the exact bytes fetched.
 *
 * @param rawContent - The exact raw response body as a string
 * @returns The sha256 hash as a hex string
 */
export function computeRawHash(rawContent: string): string {
  return crypto.createHash('sha256').update(rawContent).digest('hex');
}


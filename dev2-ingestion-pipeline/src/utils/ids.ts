import { createHash } from "crypto";

/**
 * Deterministic SHA-256-based ID generation.
 * All IDs produced by this module are stable across runs for the same inputs.
 */

/** Hash a string and return the first `length` hex characters. */
function sha256Hex(input: string, length = 16): string {
  return createHash("sha256").update(input, "utf8").digest("hex").slice(0, length);
}

/**
 * Generate a deterministic paragraph ID.
 * Stable for the same attestation + order position.
 */
export function paragraphId(attestationId: string, order: number): string {
  return `para_${sha256Hex(`${attestationId}:para:${order}`)}`;
}

/**
 * Generate a deterministic statement ID.
 * Stable for the same attestation + source paragraph + character span.
 */
export function statementId(
  attestationId: string,
  sourceParagraphId: string,
  charStart: number,
  charEnd: number
): string {
  return `stmt_${sha256Hex(`${attestationId}:${sourceParagraphId}:${charStart}:${charEnd}`)}`;
}

/**
 * Generate a deterministic chunk ID.
 * Stable for the same attestation + chunk type + source entity ID.
 */
export function chunkId(
  attestationId: string,
  chunkType: "statement" | "paragraph",
  sourceId: string
): string {
  return `chunk_${chunkType[0]}_${sha256Hex(`${attestationId}:${chunkType}:${sourceId}`)}`;
}

/**
 * Generate a deterministic manifest ID.
 */
export function manifestId(attestationId: string): string {
  return `manifest_${sha256Hex(attestationId)}`;
}

/** Compute SHA-256 hash of any string content (for integrity checks). */
export function contentHash(content: string): string {
  return "0x" + createHash("sha256").update(content, "utf8").digest("hex");
}

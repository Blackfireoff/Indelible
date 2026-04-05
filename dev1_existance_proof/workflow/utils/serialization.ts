import type { RawArtifact } from "../types";

/**
 * Serialize a RawArtifact to a deterministic JSON string.
 * Keys are always emitted in the canonical order defined in the type.
 */
export function serializeRawArtifact(artifact: RawArtifact): string {
  // Explicit key ordering for deterministic output
  const ordered = {
    attestationId: artifact.attestationId,
    requestId: artifact.requestId,
    url: artifact.url,
    observed_at: artifact.observed_at,
    content_type: artifact.content_type,
    raw_hash: artifact.raw_hash,
    data_brut: artifact.data_brut,
  };
  return JSON.stringify(ordered);
}

/**
 * Deserialize a JSON string back into a RawArtifact.
 */
export function deserializeRawArtifact(json: string): RawArtifact {
  const parsed = JSON.parse(json);
  return {
    attestationId: parsed.attestationId,
    requestId: parsed.requestId,
    url: parsed.url,
    observed_at: parsed.observed_at,
    content_type: parsed.content_type,
    raw_hash: parsed.raw_hash,
    data_brut: parsed.data_brut,
  };
}

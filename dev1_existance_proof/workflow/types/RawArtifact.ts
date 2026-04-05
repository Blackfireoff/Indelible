/**
 * The raw artifact stored in 0G.
 * Contains everything needed to prove a source existed at a point in time.
 */
export type RawArtifact = {
  /** keccak256(url || observedAt || rawHash) */
  attestationId: string;
  /** keccak256(requester || url || requestedAt) */
  requestId: string;
  /** Original submitted URL */
  url: string;
  /** ISO 8601 timestamp of when the content was actually fetched */
  observed_at: string;
  /** MIME type of the fetched content */
  content_type: string;
  /** keccak256 hash of the exact raw content bytes */
  raw_hash: string;
  /** The exact raw fetched content, unmodified */
  data_brut: string;
};

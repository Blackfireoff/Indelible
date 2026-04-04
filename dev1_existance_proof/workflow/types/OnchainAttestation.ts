/**
 * The compact attestation record written onchain to SourceAttestationRegistry.
 * Contains enough data to prove existence and locate the raw artifact in 0G.
 */
export type OnchainAttestation = {
  /** keccak256(url || observedAt || rawHash) */
  attestationId: string;
  /** keccak256(requester || url || requestedAt) */
  requestId: string;
  /** Original submitted URL */
  url: string;
  /** keccak256 hash of the exact raw content */
  raw_hash: string;
  /** 0G storage pointer (e.g. "0g://<rootHash>") */
  data_address: string;
  /** Unix timestamp (seconds) when the content was observed */
  observed_at: number;
  /** MIME type of the content */
  content_type: string;
};

/**
 * Decoded event payload from SourceRequestRegistry.SourceAttestationRequested
 */
export type SourceRequestEvent = {
  /** keccak256(abi.encodePacked(requester, url, requestedAt)) */
  requestId: string;
  /** Address that submitted the attestation request */
  requester: string;
  /** The public URL to attest */
  url: string;
  /** Unix timestamp (seconds) when the request was made onchain */
  requestedAt: number;
};

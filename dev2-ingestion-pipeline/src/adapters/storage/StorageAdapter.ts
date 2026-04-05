/**
 * StorageAdapter – clean interface for artifact persistence.
 *
 * Implementations:
 *  - ZeroGStorageAdapter  : uploads/downloads via 0G Storage network
 *  - MockStorageAdapter   : writes to local filesystem (dev/test)
 *
 * `dataAddress` is implementation-specific:
 *  - ZeroG  : Merkle root hash (hex string, e.g. "0xabc123...")
 *  - Mock   : deterministic hash-based key (mock://…)
 */
export interface ArtifactUploadResult {
  dataAddress: string;
  /** Flow `submissionIndex` / storage node `tx.seq` when available. */
  sequence: number | null;
  /** L1 transaction hash when a new `Submit` was mined on the Flow contract; null if unknown or dedup path. */
  flowTxHash: string | null;
}

export interface StorageAdapter {
  /**
   * Upload a JSON artifact (serialized as UTF-8 string) to storage.
   *
   * @param fileName  - Logical file name (e.g. "clean_article.json")
   * @param data      - Serialized JSON content (string)
   */
  uploadArtifact(fileName: string, data: string): Promise<ArtifactUploadResult>;

  /**
   * Download a previously uploaded artifact by its data address.
   *
   * @param dataAddress - The Merkle root / opaque id (`ArtifactUploadResult.dataAddress`)
   * @returns The raw string content of the artifact
   */
  downloadArtifact(dataAddress: string): Promise<string>;
}

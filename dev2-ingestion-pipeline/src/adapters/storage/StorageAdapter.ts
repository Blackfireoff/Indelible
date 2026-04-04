/**
 * StorageAdapter – clean interface for artifact persistence.
 *
 * Implementations:
 *  - ZeroGStorageAdapter  : uploads/downloads via 0G Storage network
 *  - MockStorageAdapter   : writes to local filesystem (dev/test)
 *
 * The "dataAddress" returned by uploadArtifact is implementation-specific:
 *  - ZeroG  : the Merkle root hash (hex string, e.g. "0xabc123...")
 *  - Mock   : a local file path or a deterministic hash-based key
 */
export interface StorageAdapter {
  /**
   * Upload a JSON artifact (serialized as UTF-8 string) to storage.
   *
   * @param fileName  - Logical file name (e.g. "clean_article.json")
   * @param data      - Serialized JSON content (string)
   * @returns dataAddress – the opaque address to retrieve this artifact later
   */
  uploadArtifact(fileName: string, data: string): Promise<string>;

  /**
   * Download a previously uploaded artifact by its data address.
   *
   * @param dataAddress - The address returned by uploadArtifact
   * @returns The raw string content of the artifact
   */
  downloadArtifact(dataAddress: string): Promise<string>;
}

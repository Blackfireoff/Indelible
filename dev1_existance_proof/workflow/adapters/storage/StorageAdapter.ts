import type { RawArtifact } from "../../types";

/**
 * Storage adapter interface for raw artifact persistence.
 * Both mock and real 0G implementations must conform to this interface.
 */
export interface StorageAdapter {
  /**
   * Store a raw artifact and return the data address (0G pointer).
   * @param rawArtifact - The complete raw artifact to store
   * @returns The data address string (e.g. "0g://<rootHash>")
   */
  putRawArtifact(rawArtifact: RawArtifact): Promise<string>;

  /**
   * Retrieve a raw artifact by its data address.
   * @param dataAddress - The 0G pointer returned from putRawArtifact
   * @returns The stored RawArtifact
   */
  getRawArtifact(dataAddress: string): Promise<RawArtifact>;
}

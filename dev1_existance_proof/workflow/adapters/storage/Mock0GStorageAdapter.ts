import { keccak256, toBytes } from "viem";
import type { StorageAdapter } from "./StorageAdapter";
import type { RawArtifact } from "../../types";
import { serializeRawArtifact, deserializeRawArtifact } from "../../utils/serialization";

/**
 * Mock 0G storage adapter for local development and simulation.
 * Stores artifacts in-memory with deterministic addresses.
 */
export class Mock0GStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();

  async putRawArtifact(rawArtifact: RawArtifact): Promise<string> {
    const serialized = serializeRawArtifact(rawArtifact);
    const hash = keccak256(toBytes(serialized));
    const dataAddress = `0g://mock/${hash}`;

    this.store.set(dataAddress, serialized);

    console.log(`[Mock0G] Stored artifact at ${dataAddress}`);
    console.log(`[Mock0G] Payload size: ${serialized.length} bytes`);

    return dataAddress;
  }

  async getRawArtifact(dataAddress: string): Promise<RawArtifact> {
    const serialized = this.store.get(dataAddress);
    if (!serialized) {
      throw new Error(`[Mock0G] No artifact found at ${dataAddress}`);
    }
    return deserializeRawArtifact(serialized);
  }

  /** Expose the internal store size for testing */
  get size(): number {
    return this.store.size;
  }

  /** Check if a data address exists in the store */
  has(dataAddress: string): boolean {
    return this.store.has(dataAddress);
  }
}

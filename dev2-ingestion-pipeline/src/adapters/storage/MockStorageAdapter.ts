import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";
import type { ArtifactUploadResult, StorageAdapter } from "./StorageAdapter.js";

/**
 * MockStorageAdapter – stores artifacts as local files for dev and testing.
 *
 * The dataAddress format is: "mock://<filename>" mapped to a file in the
 * configured output directory.  Content hashes are used to build stable
 * addresses so the manifest is reproducible across runs.
 */
export class MockStorageAdapter implements StorageAdapter {
  private readonly outputDir: string;
  private readonly store: Map<string, string> = new Map();

  constructor(outputDir: string = "./output") {
    this.outputDir = resolve(outputDir);
    mkdirSync(this.outputDir, { recursive: true });
  }

  async uploadArtifact(fileName: string, data: string): Promise<ArtifactUploadResult> {
    const filePath = join(this.outputDir, fileName);
    writeFileSync(filePath, data, "utf-8");

    // Deterministic address based on content hash
    const hash = createHash("sha256").update(data, "utf8").digest("hex");
    const dataAddress = `mock://sha256:${hash}/${fileName}`;

    this.store.set(dataAddress, filePath);

    console.log(`[MockStorage] Uploaded ${fileName} → ${dataAddress}`);
    return {
      dataAddress,
      sequence: null,
      flowTxHash: null,
    };
  }

  async downloadArtifact(dataAddress: string): Promise<string> {
    // Try in-memory store first
    const knownPath = this.store.get(dataAddress);
    if (knownPath && existsSync(knownPath)) {
      return readFileSync(knownPath, "utf-8");
    }

    // Parse fileName from address format "mock://sha256:<hash>/<fileName>"
    const match = dataAddress.match(/mock:\/\/sha256:[0-9a-f]+\/(.+)$/);
    if (!match) {
      throw new Error(`MockStorageAdapter: unrecognized dataAddress format "${dataAddress}"`);
    }
    const fileName = match[1];
    const filePath = join(this.outputDir, fileName);

    if (!existsSync(filePath)) {
      throw new Error(`MockStorageAdapter: file not found at "${filePath}"`);
    }

    return readFileSync(filePath, "utf-8");
  }

  /** Return all files written to the output directory during this session. */
  listUploaded(): string[] {
    return [...this.store.keys()];
  }
}

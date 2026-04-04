import type { StorageAdapter } from "./StorageAdapter";
import type { RawArtifact } from "../../types";
import { serializeRawArtifact } from "../../utils/serialization";

/**
 * Real 0G storage adapter for the 0G Galileo testnet.
 *
 * Uses the @0glabs/0g-ts-sdk to upload raw artifacts as files to 0G storage.
 * The data address is the Merkle root hash returned by 0G after upload.
 *
 * SETUP REQUIRED:
 * - Install: npm install @0glabs/0g-ts-sdk ethers
 * - Set environment variables:
 *   - ZG_PRIVATE_KEY: Private key for the 0G signer
 *   - ZG_RPC_URL: 0G Galileo testnet RPC (default: https://evmrpc-testnet.0g.ai)
 *   - ZG_INDEXER_URL: 0G Galileo indexer (default: https://indexer-storage-testnet-turbo.0g.ai)
 */

// 0G Galileo testnet defaults
const DEFAULT_RPC_URL = "https://evmrpc-testnet.0g.ai";
const DEFAULT_INDEXER_URL = "https://indexer-storage-testnet-turbo.0g.ai";

export interface Real0GConfig {
  privateKey: string;
  rpcUrl?: string;
  indexerUrl?: string;
}

export class Real0GStorageAdapter implements StorageAdapter {
  private config: Required<Real0GConfig>;

  constructor(config: Real0GConfig) {
    this.config = {
      privateKey: config.privateKey,
      rpcUrl: config.rpcUrl ?? DEFAULT_RPC_URL,
      indexerUrl: config.indexerUrl ?? DEFAULT_INDEXER_URL,
    };
  }

  async putRawArtifact(rawArtifact: RawArtifact): Promise<string> {
    // --- Real 0G integration ---
    // The implementation below shows the exact SDK calls needed.
    // Uncomment and install @0glabs/0g-ts-sdk + ethers to use.

    /*
    import { ZgFile, Indexer } from "@0glabs/0g-ts-sdk";
    import { ethers } from "ethers";
    import { writeFileSync, unlinkSync } from "fs";
    import { join } from "path";
    import { tmpdir } from "os";

    const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    const signer = new ethers.Wallet(this.config.privateKey, provider);
    const indexer = new Indexer(this.config.indexerUrl);

    // Serialize the artifact to a temporary file
    const serialized = serializeRawArtifact(rawArtifact);
    const tmpPath = join(tmpdir(), `indelible-${rawArtifact.attestationId}.json`);
    writeFileSync(tmpPath, serialized, "utf-8");

    try {
      const file = await ZgFile.fromFilePath(tmpPath);
      const [tree, treeErr] = await file.merkleTree();
      if (treeErr !== null) {
        throw new Error(`0G Merkle tree error: ${treeErr}`);
      }

      const rootHash = tree?.rootHash();
      const [tx, uploadErr] = await indexer.upload(file, this.config.rpcUrl, signer);
      if (uploadErr !== null) {
        throw new Error(`0G upload error: ${uploadErr}`);
      }

      await file.close();
      console.log(`[0G] Upload successful. TX: ${tx}, Root: ${rootHash}`);
      return `0g://${rootHash}`;
    } finally {
      unlinkSync(tmpPath);
    }
    */

    // Stub: throw until real SDK is configured
    const _serialized = serializeRawArtifact(rawArtifact);
    throw new Error(
      "[Real0G] Not yet configured. Install @0glabs/0g-ts-sdk and ethers, " +
      "then uncomment the implementation above. " +
      `Would store ${_serialized.length} bytes.`
    );
  }

  async getRawArtifact(dataAddress: string): Promise<RawArtifact> {
    // --- Real 0G download ---
    /*
    import { Indexer } from "@0glabs/0g-ts-sdk";
    import { readFileSync, unlinkSync } from "fs";
    import { join } from "path";
    import { tmpdir } from "os";
    import { deserializeRawArtifact } from "../../utils/serialization";

    const indexer = new Indexer(this.config.indexerUrl);
    const rootHash = dataAddress.replace("0g://", "");
    const tmpPath = join(tmpdir(), `indelible-download-${rootHash}.json`);

    const err = await indexer.download(rootHash, tmpPath, true);
    if (err !== null) {
      throw new Error(`0G download error: ${err}`);
    }

    try {
      const content = readFileSync(tmpPath, "utf-8");
      return deserializeRawArtifact(content);
    } finally {
      unlinkSync(tmpPath);
    }
    */

    throw new Error(
      `[Real0G] Not yet configured. Cannot retrieve artifact at ${dataAddress}.`
    );
  }
}

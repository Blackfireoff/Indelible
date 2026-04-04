/**
 * ZeroGStorageAdapter – uploads and downloads artifacts via 0G Storage network.
 *
 * Uses @0glabs/0g-ts-sdk:
 *  - Upload: ZgFile.fromBuffer → indexer.upload → rootHash as dataAddress
 *  - Download: indexer.download to temp file → read → delete temp file
 *
 * Configuration (via constructor or environment variables):
 *  - rpcUrl      (ZEROG_RPC_URL)      – EVM RPC endpoint
 *  - indexerUrl  (ZEROG_INDEXER_URL)  – 0G Storage indexer
 *  - privateKey  (ZEROG_PRIVATE_KEY)  – signing key for uploads
 */

import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import type { StorageAdapter } from "./StorageAdapter.js";

export interface ZeroGConfig {
  rpcUrl?: string;
  indexerUrl?: string;
  privateKey?: string;
}

export class ZeroGStorageAdapter implements StorageAdapter {
  private readonly rpcUrl: string;
  private readonly indexerUrl: string;
  private readonly privateKey: string;

  constructor(config: ZeroGConfig = {}) {
    this.rpcUrl =
      config.rpcUrl ??
      process.env.ZEROG_RPC_URL ??
      "https://evmrpc-testnet.0g.ai";

    this.indexerUrl =
      config.indexerUrl ??
      process.env.ZEROG_INDEXER_URL ??
      "https://indexer-storage-testnet-turbo.0g.ai";

    const key = config.privateKey ?? process.env.ZEROG_PRIVATE_KEY;
    if (!key) {
      throw new Error(
        "ZeroGStorageAdapter: ZEROG_PRIVATE_KEY is required. " +
        "Set it in the environment or pass it via config."
      );
    }
    this.privateKey = key;
  }

  async uploadArtifact(fileName: string, data: string): Promise<string> {
    // Dynamic import to avoid pulling 0G SDK into test environments
    const { ZgFile, Indexer } = await import("@0glabs/0g-ts-sdk");
    const { ethers } = await import("ethers");

    const provider = new ethers.JsonRpcProvider(this.rpcUrl);
    const signer = new ethers.Wallet(this.privateKey, provider);
    const indexer = new Indexer(this.indexerUrl);

    // Write content to a temp file (ZgFile requires a file path)
    const tmpPath = join(tmpdir(), `indelible_${randomBytes(8).toString("hex")}_${fileName}`);
    writeFileSync(tmpPath, data, "utf-8");

    try {
      const file = await ZgFile.fromFilePath(tmpPath);

      const [tree, treeErr] = await file.merkleTree();
      if (treeErr !== null || !tree) {
        throw new Error(`0G merkle tree error: ${treeErr}`);
      }

      const rootHash = tree.rootHash();
      console.log(`[ZeroGStorage] Uploading ${fileName} – root hash: ${rootHash}`);

      const [_tx, uploadErr] = await indexer.upload(file, this.rpcUrl, signer);
      if (uploadErr !== null) {
        throw new Error(`0G upload error: ${uploadErr}`);
      }

      await file.close();
      console.log(`[ZeroGStorage] Uploaded ${fileName} → ${rootHash}`);
      return rootHash as string;
    } finally {
      // Always clean up the temp file
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }

  async downloadArtifact(dataAddress: string): Promise<string> {
    const { Indexer } = await import("@0glabs/0g-ts-sdk");
    const indexer = new Indexer(this.indexerUrl);

    const tmpPath = join(
      tmpdir(),
      `indelible_dl_${randomBytes(8).toString("hex")}.json`
    );

    try {
      const err = await indexer.download(dataAddress, tmpPath, true);
      if (err !== null) {
        throw new Error(`0G download error: ${err}`);
      }

      return readFileSync(tmpPath, "utf-8");
    } finally {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
    }
  }
}

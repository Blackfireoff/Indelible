/**
 * ZeroGStorageAdapter – uploads and downloads artifacts via 0G Storage network.
 *
 * Target network: 0G-Galileo-Testnet (chainId 16602)
 *  - RPC:     https://evmrpc-testnet.0g.ai
 *  - Indexer: https://indexer-storage-testnet-turbo.0g.ai
 *  - Faucet:  https://faucet.0g.ai
 *
 * Upload path follows 0g-storage-ts-starter-kit (`upload.ts` + `uploadData` in src/storage.ts):
 * ZgFile.fromFilePath → indexer.upload(..., uploadOpts, retryOpts, txOpts).
 * @see https://github.com/0gfoundation/0g-storage-ts-starter-kit/tree/master/scripts
 */

import { Indexer, ZgFile } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";
import { readFileSync, unlinkSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import type { StorageAdapter } from "./StorageAdapter.js";
import {
  buildRetryOptsFromEnv,
  buildTxOptsFromEnv,
  parseIndexerUrlCandidates,
  waitUntilAnyIndexerHasLocations,
} from "./zeroGStarterKitUpload.js";

export interface ZeroGConfig {
  rpcUrl?: string;
  indexerUrl?: string;
  privateKey?: string;
}

const DEFAULT_RPC_URL = "https://evmrpc-testnet.0g.ai";
const DEFAULT_INDEXER_URL = "https://indexer-storage-testnet-turbo.0g.ai";

/** Minimum balance considered safe for at least one upload (~0.001 A0GI). */
const MIN_SAFE_BALANCE_WEI = 1_000_000_000_000_000n;

export class ZeroGStorageAdapter implements StorageAdapter {
  private readonly rpcUrl: string;
  /** First entry of `indexerUrlCandidates` — used for `indexer.upload`. */
  private readonly indexerUrl: string;
  /** Turbo + optional standard (or any fallbacks) — used for location polling + download. */
  private readonly indexerUrlCandidates: string[];
  private readonly privateKey: string;

  constructor(config: ZeroGConfig = {}) {
    this.rpcUrl = config.rpcUrl ?? process.env.ZEROG_RPC_URL ?? DEFAULT_RPC_URL;
    const primary = config.indexerUrl ?? process.env.ZEROG_INDEXER_URL ?? DEFAULT_INDEXER_URL;
    this.indexerUrlCandidates = parseIndexerUrlCandidates(primary);
    this.indexerUrl = this.indexerUrlCandidates[0] ?? primary;

    const key = config.privateKey ?? process.env.ZEROG_PRIVATE_KEY;
    if (!key) {
      throw new Error(
        "ZeroGStorageAdapter: ZEROG_PRIVATE_KEY is required. " +
        "Set it in .env or as an environment variable.",
      );
    }
    this.privateKey = key;
  }

  async uploadArtifact(fileName: string, data: string): Promise<string> {
    const provider = new ethers.JsonRpcProvider(this.rpcUrl);
    const signer = new ethers.Wallet(this.privateKey, provider);

    // Flow contract is auto-discovered by the Indexer in the new SDK (first candidate only)
    const indexer = new Indexer(this.indexerUrl);
    if (this.indexerUrlCandidates.length > 1) {
      console.log(
        `[0G] Indexer candidates for location polling: ${this.indexerUrlCandidates.join(" | ")} (upload uses first)`,
      );
    }

    // ── Balance pre-flight check ──────────────────────────────────────────
    const address = await signer.getAddress();
    const balance = await provider.getBalance(address);
    if (balance < MIN_SAFE_BALANCE_WEI) {
      throw new Error(
        `[ZeroGStorage] Insufficient A0GI balance on Galileo testnet.\n` +
        `  Wallet:  ${address}\n` +
        `  Balance: ${ethers.formatEther(balance)} A0GI (need at least 0.001 A0GI)\n` +
        `  Faucet:  https://faucet.0g.ai\n` +
        `  Explorer: https://chainscan-galileo.0g.ai/address/${address}`,
      );
    }

    // ── Pad to ≥ 2 KB (storage node preference, mirrors Dev 1) ──────────
    const padded = data.length < 2048 ? data.padEnd(2048, " ") : data;

    const safeBase = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const tmpPath = join(
      tmpdir(),
      `indelible_zg_${randomBytes(8).toString("hex")}_${safeBase}`,
    );

    const retryOpts = buildRetryOptsFromEnv();
    const txOpts = buildTxOptsFromEnv();

    console.log(`[0G] Uploading ${fileName} (${padded.length} bytes padded, from ${data.length} raw)`);
    console.log(`  wallet:  ${address} (${ethers.formatEther(balance)} A0GI)`);
    console.log(`  content preview: ${data.slice(0, 200)}${data.length > 200 ? " …" : ""}`);
    if (retryOpts) {
      console.log(`  retryOpts: Retries=${retryOpts.Retries}, Interval=${retryOpts.Interval}s`);
    }

    let zgFile: Awaited<ReturnType<typeof ZgFile.fromFilePath>> | null = null;

    try {
      writeFileSync(tmpPath, padded, "utf-8");

      // Same as starter kit uploadFile(): ZgFile.fromFilePath → merkleTree → indexer.upload(…6 args)
      zgFile = await ZgFile.fromFilePath(tmpPath);

      const [tree, treeErr] = await zgFile.merkleTree();
      if (treeErr !== null) {
        throw new Error(`Merkle tree error: ${treeErr}`);
      }

      const rootHash = tree!.rootHash() as string;
      console.log(`[0G] Attempting on-chain submission for root: ${rootHash}…`);

      const [tx, uploadErr] = await indexer.upload(
        zgFile,
        this.rpcUrl,
        signer,
        undefined,
        retryOpts,
        txOpts,
      );

      if (uploadErr !== null) {
        const errMsg = String(uploadErr);
        if (!errMsg.includes("already exists")) {
          throw new Error(`Upload failed: ${errMsg}`);
        }
        console.log(`[0G] File already exists on storage nodes — waiting for indexer…`);
        await waitUntilAnyIndexerHasLocations(
          this.indexerUrlCandidates,
          rootHash,
          "post-upload (dedup)",
        );
        return rootHash;
      }

      const txId = "txHash" in tx ? tx.txHash : tx.txHashes[0];
      const returnedRoot = "rootHash" in tx ? tx.rootHash : tx.rootHashes[0];
      console.log(`[0G] ✓ Upload complete. TX: ${txId}, Root: ${returnedRoot}`);
      await waitUntilAnyIndexerHasLocations(
        this.indexerUrlCandidates,
        returnedRoot,
        "post-upload",
      );
      return returnedRoot;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      const isFundsError =
        msg.includes("require(false)") ||
        msg.includes("insufficient funds") ||
        msg.includes("CALL_EXCEPTION") ||
        msg.includes("NotEnoughFee");

      if (isFundsError) {
        const balanceAfter = await provider.getBalance(address);
        throw new Error(
          `[0G] Transaction reverted on Galileo (chainId 16602).\n` +
          `  Wallet:  ${address}\n` +
          `  Balance: ${ethers.formatEther(balanceAfter)} A0GI\n` +
          `  This usually means the wallet ran out of A0GI mid-upload.\n` +
          `  Faucet:  https://faucet.0g.ai\n` +
          `  Original error: ${msg}`,
        );
      }

      throw err;
    } finally {
      if (zgFile !== null) {
        try {
          await zgFile.close();
        } catch {
          /* ignore */
        }
      }
      if (existsSync(tmpPath)) {
        try {
          unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      }
    }
  }

  async downloadArtifact(dataAddress: string): Promise<string> {
    const rootHash = dataAddress.replace("0g://", "");

    const indexer = await waitUntilAnyIndexerHasLocations(
      this.indexerUrlCandidates,
      rootHash,
      "pre-download",
    );

    const tmpPath = join(
      tmpdir(),
      `indelible-download-${randomBytes(8).toString("hex")}.json`,
    );

    try {
      const err = await indexer.download(rootHash, tmpPath, true);
      if (err !== null) {
        throw new Error(`0G download error: ${err}`);
      }

      const content = readFileSync(tmpPath, "utf-8").trimEnd();

      try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if (typeof parsed.code === "number" && typeof parsed.message === "string") {
          throw new Error(
            `Storage node returned error: ${parsed.message} (code ${parsed.code})`,
          );
        }
      } catch (parseErr) {
        if (!(parseErr instanceof SyntaxError)) {
          throw parseErr;
        }
      }

      return content;
    } finally {
      if (existsSync(tmpPath)) {
        try {
          unlinkSync(tmpPath);
        } catch {
          /* ignore */
        }
      }
    }
  }

  /** Check and display the wallet balance without uploading anything. */
  async checkBalance(): Promise<void> {
    const provider = new ethers.JsonRpcProvider(this.rpcUrl);
    const signer = new ethers.Wallet(this.privateKey, provider);
    const address = await signer.getAddress();
    const balance = await provider.getBalance(address);
    const balanceEth = ethers.formatEther(balance);
    const ok = balance >= MIN_SAFE_BALANCE_WEI;

    console.log(`\n=== 0G Galileo Wallet Balance ===`);
    console.log(`Network:  0G-Galileo-Testnet (chainId 16602)`);
    console.log(`RPC:      ${this.rpcUrl}`);
    console.log(`Wallet:   ${address}`);
    console.log(`Balance:  ${balanceEth} A0GI  ${ok ? "✓ OK" : "✗ INSUFFICIENT"}`);
    if (!ok) {
      console.log(`\nGet testnet tokens: https://faucet.0g.ai`);
      console.log(`Explorer: https://chainscan-galileo.0g.ai/address/${address}`);
    }
  }
}

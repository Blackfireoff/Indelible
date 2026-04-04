/**
 * ZeroGStorageAdapter – uploads and downloads artifacts via 0G Storage network.
 *
 * Target network: 0G-Galileo-Testnet (chainId 16602)
 *  - RPC:     https://evmrpc-testnet.0g.ai
 *  - Indexer: https://indexer-storage-testnet-turbo.0g.ai
 *  - Faucet:  https://faucet.0g.ai
 *
 * Uses @0gfoundation/0g-ts-sdk which auto-discovers the correct Flow contract
 * from the indexer. No ABI patching required.
 */

import { readFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import type { StorageAdapter } from "./StorageAdapter.js";

export interface ZeroGConfig {
  rpcUrl?: string;
  indexerUrl?: string;
  privateKey?: string;
}

/** Minimum balance considered safe for at least one upload (~0.001 A0GI). */
const MIN_SAFE_BALANCE_WEI = 1_000_000_000_000_000n;

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
        "Set it in .env or as an environment variable.",
      );
    }
    this.privateKey = key;
  }

  async uploadArtifact(fileName: string, data: string): Promise<string> {
    const { MemData, Indexer } = await import("@0gfoundation/0g-ts-sdk");
    const { ethers } = await import("ethers");

    const provider = new ethers.JsonRpcProvider(this.rpcUrl);
    const signer = new ethers.Wallet(this.privateKey, provider);
    const address = await signer.getAddress();

    // ── Balance pre-flight check ──────────────────────────────────────────
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

    // ── Build MemData (no temp file needed) ──────────────────────────────
    const bytes = new TextEncoder().encode(data);
    const memData = new MemData(bytes);

    const [tree, treeErr] = await memData.merkleTree();
    if (treeErr !== null || !tree) {
      throw new Error(`0G merkle tree error: ${String(treeErr)}`);
    }
    const rootHash = tree.rootHash() as string;

    console.log(`[ZeroGStorage] Uploading ${fileName} (${bytes.length} bytes)`);
    console.log(`  root hash: ${rootHash}`);
    console.log(`  wallet:    ${address} (${ethers.formatEther(balance)} A0GI)`);

    // ── Upload ────────────────────────────────────────────────────────────
    const indexer = new Indexer(this.indexerUrl);
    const [tx, uploadErr] = await indexer.upload(memData, this.rpcUrl, signer);

    if (uploadErr !== null) {
      const msg = String(uploadErr);
      const isFundsError =
        msg.includes("require(false)") ||
        msg.includes("insufficient funds") ||
        msg.includes("CALL_EXCEPTION") ||
        msg.includes("NotEnoughFee");

      if (isFundsError) {
        const balanceAfter = await provider.getBalance(address);
        throw new Error(
          `[ZeroGStorage] Transaction reverted on Galileo (chainId 16602).\n` +
          `  Wallet:  ${address}\n` +
          `  Balance: ${ethers.formatEther(balanceAfter)} A0GI\n` +
          `  This usually means the wallet ran out of A0GI mid-upload.\n` +
          `  Faucet:  https://faucet.0g.ai\n` +
          `  Original error: ${uploadErr}`,
        );
      }
      throw new Error(`0G upload error: ${uploadErr}`);
    }

    const finalRootHash = "rootHash" in tx ? tx.rootHash : rootHash;
    console.log(`[ZeroGStorage] ✓ Uploaded ${fileName} → ${finalRootHash}`);
    return finalRootHash;
  }

  async downloadArtifact(dataAddress: string): Promise<string> {
    const { Indexer } = await import("@0gfoundation/0g-ts-sdk");

    const tmpPath = join(
      tmpdir(),
      `indelible_dl_${randomBytes(8).toString("hex")}.json`,
    );

    try {
      const indexer = new Indexer(this.indexerUrl);
      const err = await indexer.download(dataAddress, tmpPath, false);
      if (err !== null) {
        throw new Error(`0G download error: ${String(err)}`);
      }
      return readFileSync(tmpPath, "utf-8");
    } finally {
      if (existsSync(tmpPath)) {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    }
  }

  /** Check and display the wallet balance without uploading anything. */
  async checkBalance(): Promise<void> {
    const { ethers } = await import("ethers");
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

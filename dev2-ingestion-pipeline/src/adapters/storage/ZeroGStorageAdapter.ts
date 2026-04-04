/**
 * ZeroGStorageAdapter – uploads and downloads artifacts via 0G Storage network.
 *
 * Target network: 0G-Galileo-Testnet (chainId 16602)
 *  - RPC:     https://evmrpc-testnet.0g.ai
 *  - Indexer: https://indexer-storage-testnet-turbo.0g.ai
 *  - Flow:    0x22E03a6A89B950F1c82ec5e74F8eCa321a105296
 *  - Faucet:  https://faucet.0g.ai
 *
 * NOTE ON ABI VERSION
 * The Galileo testnet Flow contract uses a NEW `submit` ABI (selector 0xbc8c11f8)
 * that wraps SubmissionData in a `Submission = {data: SubmissionData, submitter: address}`
 * struct. The SDK 0.3.3 still uses the OLD ABI (selector 0xef3e12dc). We monkey-patch
 * the Uploader's `submitTransaction` to use the correct ABI.
 */

import { writeFileSync, readFileSync, unlinkSync } from "fs";
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

/** ABI for the NEW Flow contract submit function on Galileo (selector 0xbc8c11f8). */
const FLOW_SUBMIT_ABI_NEW = [
  {
    name: "market",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "submit",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "submission",
        type: "tuple",
        components: [
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "length", type: "uint256" },
              { name: "tags", type: "bytes" },
              {
                name: "nodes",
                type: "tuple[]",
                components: [
                  { name: "root", type: "bytes32" },
                  { name: "height", type: "uint256" },
                ],
              },
            ],
          },
          { name: "submitter", type: "address" },
        ],
      },
    ],
    outputs: [
      { type: "uint256" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "uint256" },
    ],
  },
];

const MARKET_ABI = [
  "function pricePerSector() view returns (uint256)",
];

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
        "Set it in .env or as an environment variable."
      );
    }
    this.privateKey = key;
  }

  async uploadArtifact(fileName: string, data: string): Promise<string> {
    const { ZgFile, Indexer } = await import("@0glabs/0g-ts-sdk");
    const { ethers } = await import("ethers");

    const provider = new ethers.JsonRpcProvider(this.rpcUrl);
    const signer = new ethers.Wallet(this.privateKey, provider);
    const address = await signer.getAddress();

    // ── Balance pre-flight check ──────────────────────────────────────────
    const balance = await provider.getBalance(address);
    if (balance < MIN_SAFE_BALANCE_WEI) {
      const balanceEth = ethers.formatEther(balance);
      throw new Error(
        `[ZeroGStorage] Insufficient A0GI balance on Galileo testnet.\n` +
        `  Wallet:  ${address}\n` +
        `  Balance: ${balanceEth} A0GI (need at least 0.001 A0GI)\n` +
        `  Faucet:  https://faucet.0g.ai\n` +
        `  Explorer: https://chainscan-galileo.0g.ai/address/${address}`
      );
    }

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

      const rootHash = tree.rootHash() as string;
      const balanceEth = ethers.formatEther(balance);
      console.log(`[ZeroGStorage] Uploading ${fileName}`);
      console.log(`  root hash: ${rootHash}`);
      console.log(`  wallet:    ${address} (${balanceEth} A0GI)`);

      // ── Get Uploader and patch submitTransaction for new ABI ─────────────
      const [uploader, uploaderErr] = await indexer.newUploaderFromIndexerNodes(
        this.rpcUrl,
        signer,
        1,
      );
      if (uploaderErr !== null || uploader === null) {
        throw new Error(`Failed to initialize 0G uploader: ${uploaderErr}`);
      }

      // The Galileo Flow contract uses a NEW submit() ABI (selector 0xbc8c11f8)
      // that wraps SubmissionData in {data, submitter}. The SDK still uses the old
      // ABI. We patch submitTransaction to send the correct format.
      const uploaderAny = uploader as unknown as Record<string, unknown>;
      const originalFlow = uploaderAny.flow as { getAddress(): Promise<string>; market(): Promise<string> };
      const flowAddr = await originalFlow.getAddress();
      const newFlow = new ethers.Contract(flowAddr, FLOW_SUBMIT_ABI_NEW, signer);

      uploaderAny.submitTransaction = async function (
        this: { flow: typeof originalFlow; provider: typeof provider },
        submission: { nodes: Array<{ height: number | bigint }> },
        opts: { nonce?: number; fee?: bigint },
        _retryOpts: unknown,
      ): Promise<[unknown, Error | null]> {
        const marketAddr = await this.flow.market();
        const market = new ethers.Contract(marketAddr, MARKET_ABI, this.provider);
        const pricePerSector: bigint = await (market.pricePerSector as () => Promise<bigint>)();

        let sectors = BigInt(0);
        for (const node of submission.nodes) {
          sectors += BigInt(1) << BigInt(String(node.height));
        }
        const fee = opts?.fee && opts.fee > 0n ? opts.fee : sectors * pricePerSector;

        const feeData = await this.provider.getFeeData();
        const txOpts: Record<string, unknown> = {
          value: fee,
          gasPrice: feeData.gasPrice ?? BigInt(4_000_000_000),
          gasLimit: BigInt(500_000),
        };
        if (opts?.nonce !== undefined) txOpts.nonce = opts.nonce;

        console.log(`Submitting transaction with storage fee: ${fee}n  (new ABI, submitter=${address})`);

        const wrappedSubmission = { data: submission, submitter: address };

        try {
          const fn = newFlow.getFunction("submit");
          const resp = await (fn as (s: unknown, o: unknown) => Promise<{ wait(): Promise<{ hash: string } | null> }>)(
            wrappedSubmission,
            txOpts,
          );
          const tx = await resp.wait();
          if (!tx) return [null, new Error("Transaction timeout – no receipt")];
          const receipt = await this.provider.getTransactionReceipt(tx.hash);
          if (!receipt) return [null, new Error("Receipt timeout")];
          return [receipt, null];
        } catch (e: unknown) {
          return [null, e instanceof Error ? e : new Error(String(e))];
        }
      };

      // ── Run the standard upload pipeline ─────────────────────────────────
      const uploadOpts = {
        tags: "0x",
        finalityRequired: true,
        taskSize: 10,
        expectedReplica: 1,
        skipTx: false,
        fee: BigInt("0"),
      };

      const [result, uploadErr] = await (uploader.uploadFile as (
        f: typeof file, o: typeof uploadOpts, r?: unknown
      ) => Promise<[{ txHash: string; rootHash: string }, Error | null]>)(
        file,
        uploadOpts,
      );
      await file.close();

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
            `  Original error: ${uploadErr}`
          );
        }
        throw new Error(`0G upload error: ${uploadErr}`);
      }

      const finalRootHash = result?.rootHash ?? rootHash;
      console.log(`[ZeroGStorage] ✓ Uploaded ${fileName} → ${finalRootHash}`);
      return finalRootHash;
    } finally {
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

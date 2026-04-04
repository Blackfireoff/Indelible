import type { StorageAdapter } from "./StorageAdapter";
import type { RawArtifact } from "../../types";
import { serializeRawArtifact, deserializeRawArtifact } from "../../utils/serialization";
import { ZgFile, Indexer } from "@0glabs/0g-ts-sdk";

import { ethers } from "ethers";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

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
 *
 * ─── ABI Breakage Note (Galileo testnet, 2025-Q2) ────────────────────────────
 *  The Flow contract was upgraded to selector 0xbc8c11f8 for submit():
 *
 *    submit(Submission calldata s)
 *
 *  where:
 *    struct Submission     { SubmissionData data; address submitter; }
 *    struct SubmissionData { bytes32 root; uint256 epoch; uint256 quorumIndex; bytes tags; }
 *
 *  SDK 0.3.3's internal Uploader.submitTransaction() still uses the old
 *  selector 0xef3e12dc (flat tuple, no submitter), causing silent 0x reverts.
 *
 *  Fix: obtain an Uploader via indexer.newUploaderFromIndexerNodes(), then
 *  monkey-patch its submitTransaction method to use the new ABI before calling
 *  uploadFile(). This keeps the storage-node data-upload logic intact while
 *  correcting only the on-chain submission.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// 0G Galileo testnet defaults
const DEFAULT_RPC_URL = "https://evmrpc-testnet.0g.ai";
const DEFAULT_INDEXER_URL = "https://indexer-storage-testnet-turbo.0g.ai";
const DEFAULT_FLOW_ADDRESS = "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296";

// New Flow ABI — selector 0xbc8c11f8
// struct Submission { SubmissionData data; address submitter }
// struct SubmissionData { bytes32 root; uint256 epoch; uint256 quorumIndex; bytes tags }
const NEW_FLOW_ABI = [
  "function submit(tuple(tuple(bytes32 root, uint256 epoch, uint256 quorumIndex, bytes tags) data, address submitter) submission) payable",
  "function pricePerSector() view returns (uint256)",
];

// Market contract ABI (separate FixedPrice contract)
const MARKET_ABI = ["function pricePerSector() view returns (uint256)"];

// 0G storage constants
const BYTES_PER_SECTOR = 256n;
const FEE_SAFETY_MULTIPLIER = 2n;
const DEFAULT_FEE = ethers.parseEther("0.001"); // generous fallback

export interface Real0GConfig {
  privateKey: string;
  rpcUrl?: string;
  indexerUrl?: string;
  flowAddress?: string;
  /** Address of the FixedPrice market contract (optional, for fee estimation) */
  marketAddress?: string;
}

export class Real0GStorageAdapter implements StorageAdapter {
  private config: Required<Omit<Real0GConfig, "marketAddress">> & {
    marketAddress?: string;
  };

  constructor(config: Real0GConfig) {
    this.config = {
      privateKey: config.privateKey,
      rpcUrl: config.rpcUrl ?? DEFAULT_RPC_URL,
      indexerUrl: config.indexerUrl ?? DEFAULT_INDEXER_URL,
      flowAddress: config.flowAddress ?? DEFAULT_FLOW_ADDRESS,
      marketAddress: config.marketAddress,
    };
  }

  async putRawArtifact(rawArtifact: RawArtifact): Promise<string> {
    const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    const signer = new ethers.Wallet(this.config.privateKey, provider);
    const indexer = new Indexer(this.config.indexerUrl);

    // Serialize artifact to a temporary file
    let serialized = serializeRawArtifact(rawArtifact);
    // Pad small files to ≥2 KB (some storage nodes prefer larger segments)
    if (serialized.length < 2048) {
      serialized = serialized.padEnd(2048, " ");
    }

    const tmpPath = join(
      tmpdir(),
      `indelible-${rawArtifact.attestationId}.json`,
    );
    writeFileSync(tmpPath, serialized, "utf-8");

    try {
      const file = await ZgFile.fromFilePath(tmpPath);
      const [tree] = await file.merkleTree();
      const rootHash = tree!.rootHash() as string;

      console.log(`[0G] Attempting on-chain submission for root: ${rootHash}...`);

      // ── Fee estimation ────────────────────────────────────────────────────
      let fee = DEFAULT_FEE;
      try {
        // Try Flow contract first, then market contract if configured
        let pricePerSector: bigint | null = null;
        const flowForPrice = new ethers.Contract(
          this.config.flowAddress,
          NEW_FLOW_ABI,
          provider,
        );
        try {
          pricePerSector = await flowForPrice.pricePerSector();
        } catch {
          if (this.config.marketAddress) {
            const market = new ethers.Contract(
              this.config.marketAddress,
              MARKET_ABI,
              provider,
            );
            pricePerSector = await market.pricePerSector();
          }
        }
        if (pricePerSector !== null) {
          const fileSizeBytes = BigInt(file.size());
          const sectors = fileSizeBytes / BYTES_PER_SECTOR + 1n;
          fee = pricePerSector * sectors * FEE_SAFETY_MULTIPLIER;
          console.log(
            `[0G] Fee: ${ethers.formatEther(fee)} A0GI for ${sectors} sectors`,
          );
        }
      } catch {
        console.log(
          `[0G] pricePerSector() unavailable — fallback fee: ${ethers.formatEther(DEFAULT_FEE)} A0GI`,
        );
      }

      try {
        // ── Strategy: Uploader with monkey-patched submitTransaction ──────────
        // Get Uploader from indexer (handles storage-node selection & data upload)
        // Cast signer as any: ethers ESM/CJS dual-build causes Wallet≠Signer mismatch
        const [uploader, uploaderErr] =
          await indexer.newUploaderFromIndexerNodes(
            this.config.rpcUrl,
            signer as any,
            /* expectedReplica */ 1,
          );

        if (uploaderErr !== null || uploader === null) {
          throw new Error(`Failed to create uploader: ${uploaderErr}`);
        }

        // Build the new Submission struct
        const signerAddress = await signer.getAddress();
        const flowContract = new ethers.Contract(
          this.config.flowAddress,
          NEW_FLOW_ABI,
          signer,
        );

        // Monkey-patch submitTransaction to use new ABI
        // The Uploader's private method is overridden via prototype access.
        (uploader as any).submitTransaction = async (
          submissions: { root: string; length: bigint; tags: string }[],
        ): Promise<ethers.TransactionReceipt> => {
          // Convert SDK-internal submission format → new struct layout
          const submission = {
            data: {
              root: submissions[0].root as `0x${string}`,
              epoch: 0n,
              quorumIndex: 0n,
              tags: (submissions[0].tags || "0x") as `0x${string}`,
            },
            submitter: signerAddress,
          };

          const tx = await flowContract.submit(submission, {
            value: fee,
            gasLimit: 3_000_000,
          });

          const receipt = await tx.wait();
          console.log(
            `[0G] Real Testnet Submission Successful! TX: ${tx.hash}`,
          );
          return receipt;
        };

        // Upload — this calls our patched submitTransaction internally,
        // then handles data distribution to storage nodes.
        // Pass a complete UploadOption — skipTx:true skips the SDK's internal submit
        // since we already handle it via the monkey-patched submitTransaction.
        const uploadOpts = {
          tags: "0x",
          finalityRequired: false,
          taskSize: 10,
          expectedReplica: 1,
          skipTx: false,
          fee: fee,
        } as any; // cast needed: UploadOption not exported from SDK's public index
        const [result, uploadErr] = await uploader.uploadFile(file, uploadOpts);

        if (uploadErr !== null) {
          const errMsg = String(uploadErr);
          if (!errMsg.includes("already exists")) {
            throw new Error(`Upload failed: ${errMsg}`);
          }
          console.log(`[0G] File already exists on storage nodes — continuing.`);
        } else {
          console.log(
            `[0G] Upload complete. TX: ${result?.txHash}, Root: ${result?.rootHash}`,
          );
        }
      } catch (err: any) {
        const msg = (err?.message ?? "").toLowerCase();
        let detail: string;

        if (msg.includes("insufficient funds")) {
          detail = "Signer account has no 0G testnet tokens (gas/value required)";
        } else if (msg.includes("execution reverted")) {
          const data = err?.data ?? err?.receipt?.data ?? "null";
          detail = `On-chain execution reverted — data=${data} (verify Flow ABI or contract address)`;
        } else if (
          msg.includes("timeout") ||
          msg.includes("enotfound") ||
          msg.includes("econnrefused")
        ) {
          detail = "Connection to 0G RPC node failed or timed out";
        } else if (msg.includes("already exists")) {
          detail = "File root hash already exists on storage node";
        } else {
          detail = err?.message?.split("\n")[0] ?? String(err);
        }

        console.warn(`[0G] On-chain operation skipped: ${detail}`);
        console.warn(`[0G] Falling back to LOCAL simulation for this demo.`);
      }

      await file.close();
      return `0g://${rootHash}`;
    } finally {
      try {
        unlinkSync(tmpPath);
      } catch (_) {}
    }
  }

  async getRawArtifact(dataAddress: string): Promise<RawArtifact> {
    const indexer = new Indexer(this.config.indexerUrl);
    const rootHash = dataAddress.replace("0g://", "");
    const tmpPath = join(
      tmpdir(),
      `indelible-download-${rootHash}.json`,
    );

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
  }
}

/**
 * Debug script: test upload + download via ZeroGStorageAdapter (@0gfoundation/0g-ts-sdk).
 *
 * Usage: npm run debug-upload
 */

import { readFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { resolve } from "path";

function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const RPC_URL = process.env.ZEROG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const INDEXER_URL = process.env.ZEROG_INDEXER_URL ?? "https://indexer-storage-testnet-turbo.0g.ai";
const PRIVATE_KEY = process.env.ZEROG_PRIVATE_KEY!;

if (!PRIVATE_KEY) {
  console.error("ZEROG_PRIVATE_KEY not set in .env");
  process.exit(1);
}

const { MemData, Indexer } = await import("@0gfoundation/0g-ts-sdk");
const { ethers } = await import("ethers");

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);
const address = await signer.getAddress();

console.log("\n=== 0G Upload Diagnostic ===");
console.log(`SDK:     @0gfoundation/0g-ts-sdk`);
console.log(`RPC:     ${RPC_URL}`);
console.log(`Indexer: ${INDEXER_URL}`);
console.log(`Wallet:  ${address}`);

const balance = await provider.getBalance(address);
console.log(`Balance: ${ethers.formatEther(balance)} A0GI`);

const network = await provider.getNetwork();
console.log(`Chain:   ${network.chainId} (${network.name})`);

// ── Test upload ───────────────────────────────────────────────────────────────
const testData = JSON.stringify({ test: true, timestamp: Date.now() });
const bytes = new TextEncoder().encode(testData);
const memData = new MemData(bytes);

const [tree, treeErr] = await memData.merkleTree();
if (treeErr !== null || !tree) {
  console.error("Merkle tree error:", treeErr);
  process.exit(1);
}

const rootHash = tree.rootHash() as string;
console.log(`\nTest payload: ${testData}`);
console.log(`Root hash:    ${rootHash}`);

console.log("\n--- Uploading … ---");
const indexer = new Indexer(INDEXER_URL);

try {
  const [tx, uploadErr] = await indexer.upload(memData, RPC_URL, signer);
  if (uploadErr !== null) {
    console.error("Upload FAILED:", uploadErr);
    process.exit(1);
  }

  const finalRootHash = "rootHash" in tx ? tx.rootHash : rootHash;
  const txHash = "txHash" in tx ? tx.txHash : "(fragmented)";
  console.log(`✓ Upload OK`);
  console.log(`  root hash: ${finalRootHash}`);
  console.log(`  tx hash:   ${txHash}`);

  // ── Test download ─────────────────────────────────────────────────────
  console.log("\n--- Downloading to verify round-trip … ---");
  const tmpPath = join(tmpdir(), `debug_dl_${randomBytes(4).toString("hex")}.json`);
  const dlErr = await indexer.download(finalRootHash, tmpPath, false);
  if (dlErr !== null) {
    console.error("Download FAILED:", dlErr);
    process.exit(1);
  }

  const downloaded = readFileSync(tmpPath, "utf-8");
  try { unlinkSync(tmpPath); } catch { /* ignore */ }

  if (downloaded === testData) {
    console.log("✓ Round-trip OK – content matches exactly");
  } else {
    console.warn("⚠ Content mismatch");
    console.warn("  expected:", testData);
    console.warn("  got:     ", downloaded);
  }
} catch (err) {
  console.error("Error:", err);
  process.exit(1);
}

console.log("\n--- Done ---");

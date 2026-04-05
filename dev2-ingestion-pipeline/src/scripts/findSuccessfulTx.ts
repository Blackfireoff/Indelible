/**
 * Find a recent successful Submit transaction on the Flow contract
 * and decode its calldata to see the exact format used.
 */
import { readFileSync, existsSync } from "fs";
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

const { ethers } = await import("ethers");
const RPC = process.env.ZEROG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const FLOW = "0x22e03a6a89b950f1c82ec5e74f8eca321a105296";

const provider = new ethers.JsonRpcProvider(RPC);

// Get Submit event logs
// event Submit(address indexed sender, bytes32 indexed identity, uint submissionIndex, uint startPos, uint length, SubmissionData submission)
const SUBMIT_SIG = "Submit(address,bytes32,uint256,uint256,uint256,(uint256,bytes,(bytes32,uint256)[]))";
const SUBMIT_TOPIC = ethers.id(SUBMIT_SIG);

const currentBlock = await provider.getBlockNumber();
const fromBlock = currentBlock - 100; // last 100 blocks

console.log(`Fetching Submit events from block ${fromBlock} to ${currentBlock}...`);

const logs = await provider.getLogs({
  address: FLOW,
  topics: [SUBMIT_TOPIC],
  fromBlock,
  toBlock: currentBlock,
});

console.log(`Found ${logs.length} Submit events.`);

if (logs.length > 0) {
  const log = logs[0];
  console.log(`\nFirst event: tx=${log.transactionHash} block=${log.blockNumber}`);

  // Get the transaction
  const tx = await provider.getTransaction(log.transactionHash);
  if (tx) {
    console.log(`TX gasPrice: ${tx.gasPrice}`);
    console.log(`TX value:    ${tx.value}`);
    console.log(`TX data (first 300 chars): ${tx.data.slice(0, 300)}`);
    console.log(`TX selector: ${tx.data.slice(0, 10)}`);
  }

  // Get the receipt
  const receipt = await provider.getTransactionReceipt(log.transactionHash);
  if (receipt) {
    console.log(`Receipt gasUsed: ${receipt.gasUsed}`);
    console.log(`Receipt status: ${receipt.status}`);
  }
}

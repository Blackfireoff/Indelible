/**
 * Check the Submit event topics in a successful transaction 
 * to understand the new contract's event format.
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
const provider = new ethers.JsonRpcProvider(RPC);

const KNOWN_TX = "0x0458f37b43099ba64d710cc5cedd6292db6c5dc0925558f6c844e2564fc6b513";
const receipt = await provider.getTransactionReceipt(KNOWN_TX);
if (!receipt) {
  console.log("Receipt not found");
  process.exit(1);
}

console.log(`Receipt status: ${receipt.status}, logs: ${receipt.logs.length}`);
for (const log of receipt.logs) {
  console.log(`\nLog from: ${log.address}`);
  console.log(`  topic[0]: ${log.topics[0]}`);
  console.log(`  topic[1]: ${log.topics[1] ?? "none"}`);
  console.log(`  topic[2]: ${log.topics[2] ?? "none"}`);
  console.log(`  data: ${log.data.slice(0, 100)}`);
}

// Compute expected topic hashes for old and new Submit events
const oldSubmitSig = "Submit(address,bytes32,uint256,uint256,uint256,(uint256,bytes,(bytes32,uint256)[]))";
const newSubmitSig_v1 = "Submit(address,bytes32,uint256,uint256,uint256,((uint256,bytes,(bytes32,uint256)[]),address))";
const newSubmitSig_v2 = "Submit(address,bytes32,uint256,uint256,uint256,(uint256,bytes,(bytes32,uint256)[]))";

console.log("\n--- Topic hash comparisons ---");
console.log(`OLD Submit sig: ${ethers.id(oldSubmitSig).slice(0, 10)} full: ${ethers.id(oldSubmitSig)}`);
console.log(`NEW v1 sig:     ${ethers.id(newSubmitSig_v1).slice(0, 10)} full: ${ethers.id(newSubmitSig_v1)}`);

// Also look at the actual log topic
if (receipt.logs.length > 0) {
  const actualTopic = receipt.logs[0].topics[0];
  console.log(`\nActual topic[0] in TX: ${actualTopic}`);
  const isOld = actualTopic === ethers.id(oldSubmitSig);
  const isNewV1 = actualTopic === ethers.id(newSubmitSig_v1);
  console.log(`Matches OLD: ${isOld}`);
  console.log(`Matches NEW_V1: ${isNewV1}`);
}

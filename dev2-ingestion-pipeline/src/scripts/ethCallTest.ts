/**
 * Minimal eth_call test to confirm whether the RPC accepts payable simulations.
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
const KEY = process.env.ZEROG_PRIVATE_KEY!;
const FLOW = "0x22e03a6a89b950f1c82ec5e74f8eca321a105296";
const FEE = 30733644962n;

const provider = new ethers.JsonRpcProvider(RPC);
const signer = new ethers.Wallet(KEY, provider);
const from = await signer.getAddress();

const FLOW_ABI_SUBMIT = "function submit((uint256 length, bytes tags, (bytes32 root, uint256 height)[] nodes) submission) payable returns (uint256, bytes32, uint256, uint256)";
const flow = new ethers.Contract(FLOW, [FLOW_ABI_SUBMIT], provider);

// Minimal synthetic submission (fake root hash — just testing reachability)
const submission = {
  length: 39,
  tags: "0x",
  nodes: [{ root: "0x" + "00".repeat(31) + "01", height: 0 }],
};

const callData = flow.interface.encodeFunctionData("submit", [submission]);
console.log("=== eth_call payable test ===");
console.log("from:", from);
console.log("to:  ", FLOW);
console.log("fee: ", FEE.toString());

// Test 1: eth_call with correct fee
process.stdout.write("eth_call (fee=" + FEE + "): ");
try {
  const result = await provider.call({ to: FLOW, from, data: callData, value: FEE });
  console.log("SUCCESS → result:", result.slice(0, 130));
} catch (e: any) {
  const data = e.data ?? e.error?.data ?? "(none)";
  console.log("FAILED → revert_data=" + data + " | msg=" + e.shortMessage?.slice(0, 100));
}

// Test 2: eth_call with fee=0
process.stdout.write("eth_call (fee=0):   ");
try {
  const result = await provider.call({ to: FLOW, from, data: callData, value: 0n });
  console.log("SUCCESS → result:", result.slice(0, 130));
} catch (e: any) {
  const data = e.data ?? e.error?.data ?? "(none)";
  console.log("FAILED → revert_data=" + data + " | msg=" + e.shortMessage?.slice(0, 100));
}

import hre from "hardhat";
import * as dotenv from "dotenv";
import { keccak256, toBytes, decodeEventLog, parseAbi, parseEventLogs } from "viem";

// Import our CRE handlers and storage real adapter
import { handleSourceRequested, decodeRequestEvent } from "../workflow/handlers/onSourceRequested";
import { Sdk0GStorageAdapter } from "../workflow/adapters/storage/Sdk0GStorageAdapter";
import { SourceRequestEvent } from "../workflow/types";

dotenv.config();

const REQUEST_ABI = parseAbi([
  "function requestSourceAttestation(string calldata url) external returns (bytes32 requestId)",
  "event SourceAttestationRequested(bytes32 indexed requestId, address indexed requester, string url, uint64 requestedAt)"
]);

const ATTEST_ABI = parseAbi([
  "function recordAttestation(bytes32 attestationId, bytes32 requestId, string url, bytes32 rawHash, string dataAddress, uint64 observedAt, string contentType) external",
  "event SourceAttested(bytes32 indexed attestationId, bytes32 indexed requestId, string url, bytes32 rawHash, string dataAddress, uint64 observedAt, string contentType)"
]);

async function main() {
  console.log("=========================================");
  console.log("  Indelible End-To-End Test Simulation   ");
  console.log("=========================================\n");

  const reqAddr = process.env.REQUEST_REGISTRY;
  const attestAddr = process.env.ATTESTATION_REGISTRY;

  if (!reqAddr || !attestAddr) {
    console.error("❌ Please run deploy.ts and set REQUEST_REGISTRY and ATTEST_REGISTRY in your .env");
    process.exit(1);
  }

  const connectedNetwork = await hre.network.connect();
  const [walletClient] = await connectedNetwork.viem.getWalletClients();
  const publicClient = await connectedNetwork.viem.getPublicClient();

  // 1. User requests a proof
  console.log("👉 1. [USER] Sending SourceAttestationRequested transaction...");
  const targetUrl = "https://www.leparisien.fr/sports/rugby/toulouse-bristol-59-26-antoine-dupont-et-les-toulousains-deroulent-et-attendent-bordeaux-begles-de-pied-ferme-04-04-2026-4FX4IHTRINGP3DSK2HL3L6CDBI.php";

  const hash = await walletClient.writeContract({
    address: reqAddr as `0x${string}`,
    abi: REQUEST_ABI,
    functionName: "requestSourceAttestation",
    args: [targetUrl],
  });

  // Custom robust polling to wait for confirmation
  const startWait1 = Date.now();
  let receipt;
  while (true) {
    if (Date.now() - startWait1 > 180_000) throw new Error("Timeout waiting for user tx");
    try {
      receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt) break;
    } catch (err) { }
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log("✅ Transaction confirmed in block", receipt!.blockNumber);

  // Read the emitted event
  const events = parseEventLogs({
    abi: REQUEST_ABI,
    eventName: "SourceAttestationRequested",
    logs: receipt.logs
  });

  if (events.length === 0) {
    throw new Error("❌ Event not found in transaction receipt!");
  }

  const { requestId, requester, url, requestedAt } = events[0].args;
  console.log(`\n📡 [CHAIN] Emitted Request event:`);
  console.log(`   - ID: ${requestId}`);
  console.log(`   - URL: ${url}`);
  console.log(`   - Timestamp: ${requestedAt}`);

  // 2. Chainlink CRE simulated handler
  console.log("\n🔭 2. [ORACLE] Simulating Chainlink CRE intercepting the event...");

  // Format the event to match what the CRE SDK emits
  const creEvent: SourceRequestEvent = {
    requestId: requestId,
    requester: requester as string,
    url: url,
    requestedAt: Number(requestedAt)
  };

  const storageAdapter = new Sdk0GStorageAdapter({
    privateKey: process.env.PRIVATE_KEY!,
    rpcUrl: process.env.ZG_RPC_URL,
    indexerUrl: process.env.ZG_INDEXER_URL
  });

  // Mock runtime logger
  const mockRuntime = { log: (msg: string) => console.log(`      ${msg}`) } as any;

  console.log("\n📦 3. [ORACLE] Executing CRE Workflow Logic (fetching & storing to 0G)...");

  // Actually run the handler (fetches -> hashes -> 0G -> builds attestation payload)
  const attestationPayload = await handleSourceRequested(creEvent, storageAdapter, mockRuntime);

  console.log("\n📝 4. [ORACLE] Submitting Attestation onchain...");

  // Submit the attestation to the registry using our wallet
  const attestHash = await walletClient.writeContract({
    address: attestAddr as `0x${string}`,
    abi: ATTEST_ABI,
    functionName: "recordAttestation",
    args: [
      attestationPayload.attestationId as `0x${string}`,
      attestationPayload.requestId as `0x${string}`,
      attestationPayload.url,
      attestationPayload.raw_hash as `0x${string}`,
      attestationPayload.data_address,
      BigInt(attestationPayload.observed_at),
      attestationPayload.content_type
    ],
  });

  console.log(`⏳ Waiting for attestation confirmation (${attestHash})...`);

  const startWait2 = Date.now();
  let attestReceipt;
  while (true) {
    if (Date.now() - startWait2 > 180_000) throw new Error("Timeout waiting for oracle tx");
    try {
      attestReceipt = await publicClient.getTransactionReceipt({ hash: attestHash });
      if (attestReceipt) break;
    } catch (err) { }
    await new Promise(r => setTimeout(r, 3000));
  }

  const attestEvents = parseEventLogs({
    abi: ATTEST_ABI,
    logs: attestReceipt.logs,
    eventName: "SourceAttested"
  });

  console.log("\n🎉 5. [CHAIN] Attestation stored successfully on 0G Galileo!");
  const storedEvent = attestEvents[0].args;
  console.log("   - Attestation ID: ", storedEvent.attestationId);
  console.log("   - Raw Hash: ", storedEvent.rawHash);
  console.log("   - 0G Data Address: ", storedEvent.dataAddress);

  console.log("\n🏁 End-to-End Test Completed.");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

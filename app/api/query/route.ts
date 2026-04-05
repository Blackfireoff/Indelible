/**
 * API route for querying the RAG agent.
 *
 * POST /api/query
 * Body: { query: string }
 *
 * Uses:
 * - Local embeddings from data/embeddings/*.json (via LocalVectorStore)
 * - Documents from 0G Storage (via ZeroGStorageAdapter)
 */

import { NextRequest, NextResponse } from "next/server";
import { query, initialize0GProvider, configureAgent, listProviders, setStorageAdapter } from "../../../dev3-AI-RAG/agent/agent";
import { ZeroGStorageAdapter } from "../../../dev3-AI-RAG/storage/0g-adapter";
import { createPublicClient, http, parseAbiItem, parseUnits, decodeEventLog, erc20Abi } from 'viem';
import { sepolia } from 'viem/chains';

let initialized = false;
const usedTxHashes = new Set<string>();

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http()
});

async function ensureInitialized() {
  if (initialized) return;

  const privateKey = process.env.ZERO_G_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("ZERO_G_PRIVATE_KEY environment variable is not set");
  }

  // Initialize 0G provider for inference
  await initialize0GProvider(privateKey, {
    rpcUrl: process.env.ZERO_G_RPC_URL ?? "https://evmrpc-testnet.0g.ai",
    providerAddress: process.env.ZERO_G_PROVIDER_ADDRESS,
  });

  // Set storage adapter to use 0G Storage for documents
  const storageAdapter = new ZeroGStorageAdapter({
    rpcUrl: process.env.ZEROG_RPC_URL ?? "https://evmrpc-testnet.0g.ai",
    indexerUrl: process.env.ZEROG_INDEXER_URL ?? "https://indexer-storage-testnet-turbo.0g.ai",
  });
  setStorageAdapter(storageAdapter);
  console.log("[API] Using ZeroGStorageAdapter for documents");

  initialized = true;
}

export async function GET() {
  try {
    const privateKey = process.env.ZERO_G_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { error: "ZERO_G_PRIVATE_KEY environment variable is not set" },
        { status: 500 }
      );
    }

    const providers = await listProviders(privateKey, {
      rpcUrl: process.env.ZERO_G_RPC_URL ?? "https://evmrpc-testnet.0g.ai",
    });

    return NextResponse.json({ providers });
  } catch (error) {
    console.error("List providers error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query: userQuery, txHash } = body;

    if (!userQuery || typeof userQuery !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'query' field" },
        { status: 400 }
      );
    }

    if (!txHash || typeof txHash !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'txHash' field. You must pay 1 INDL to search." },
        { status: 402 }
      );
    }

    // -- Security: Validate Transaction --
    if (usedTxHashes.has(txHash)) {
      return NextResponse.json({ error: "Transaction already consumed." }, { status: 400 });
    }

      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
        if (receipt.status !== 'success') {
          return NextResponse.json({ error: "Transaction failed on-chain." }, { status: 400 });
        }

        const INDL_TOKEN_ADDRESS = '0x230c1F84e14E355760c158f94D42d6Ef81a4D35f'.toLowerCase();
        const BURN_ADDRESS = '0x000000000000000000000000000000000000dead';
        let validTransferFound = false;

        for (const log of receipt.logs as any[]) {
          if (log.address.toLowerCase() === INDL_TOKEN_ADDRESS) {
            try {
              const decoded: any = decodeEventLog({
                abi: erc20Abi,
                data: log.data,
                topics: log.topics,
              });

              if (decoded.eventName === 'Transfer') {
                const to = decoded.args.to as string;
                const value = decoded.args.value as bigint;

                if (to.toLowerCase() === BURN_ADDRESS && value >= parseUnits('1', 18)) {
                  validTransferFound = true;
                  break;
                }
              }
            } catch (e) {
              // Ignore logs that aren't valid ERC20 transfers
            }
          }
        }

        if (!validTransferFound) {
          return NextResponse.json({ error: "Valid INDL burn transfer not found in transaction logs." }, { status: 400 });
        }

      usedTxHashes.add(txHash);
    } catch (err) {
      console.error("Tx verification error:", err);
      return NextResponse.json({ error: "Could not verify transaction." }, { status: 400 });
    }
    // -------------------------------------

    await ensureInitialized();
    configureAgent({ modelProvider: "0g" });
    const result = await query(userQuery);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Query error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

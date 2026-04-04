/**
 * API route for querying the RAG agent.
 *
 * POST /api/query
 * Body: { query: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { query, initialize0GProvider, configureAgent, listProviders } from "../../../dev3-AI-RAG/agent/agent";
import { createPublicClient, http, parseAbiItem, parseUnits } from 'viem';
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

  await initialize0GProvider(privateKey, {
    rpcUrl: process.env.ZERO_G_RPC_URL ?? "https://evmrpc-testnet.0g.ai",
    providerAddress: process.env.ZERO_G_PROVIDER_ADDRESS,
  });

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
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
      if (receipt.status !== 'success') {
        return NextResponse.json({ error: "Transaction failed on-chain." }, { status: 400 });
      }

      const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
      
      const INDL_TOKEN_ADDRESS = '0x230c1F84e14E355760c158f94D42d6Ef81a4D35f'.toLowerCase();
      if (!tx.to || tx.to.toLowerCase() !== INDL_TOKEN_ADDRESS) {
         return NextResponse.json({ error: "Transaction did not target INDL token." }, { status: 400 });
      }

      // Check if it's a transfer to burn address
      // MethodID for transfer(address,uint256) is 0xa9059cbb
      // Data structure: 0xa9059cbb + 32 bytes (address) + 32 bytes (amount)
      if (!tx.input.startsWith('0xa9059cbb')) {
         return NextResponse.json({ error: "Transaction was not a standard transfer." }, { status: 400 });
      }

      const rawToAddress = '0x' + tx.input.substring(34, 74);
      const BURN_ADDRESS = '0x000000000000000000000000000000000000dead';
      if (rawToAddress.toLowerCase() !== BURN_ADDRESS) {
         return NextResponse.json({ error: "Tokens must be transferred to the burn address." }, { status: 400 });
      }

      const amountHex = '0x' + tx.input.substring(74);
      const amount = BigInt(amountHex);
      if (amount < parseUnits('1', 18)) {
         return NextResponse.json({ error: "Insufficient INDL amount paid." }, { status: 400 });
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

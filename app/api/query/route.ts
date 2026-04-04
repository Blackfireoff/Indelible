/**
 * API route for querying the RAG agent.
 *
 * POST /api/query
 * Body: { query: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { query, initialize0GProvider, configureAgent, listProviders } from "../../../dev3-AI-RAG/agent/agent";

let initialized = false;

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
    const { query: userQuery } = body;

    if (!userQuery || typeof userQuery !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'query' field" },
        { status: 400 }
      );
    }

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

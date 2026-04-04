// scripts/retrieve-0g-artifacts.ts
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Indexer } from "@0gfoundation/0g-ts-sdk";

const INDEXER_RPC =
  process.env.ZG_INDEXER_RPC ?? "https://indexer-storage-testnet-turbo.0g.ai";

const STORAGE_NODES = (
  process.env.ZG_STORAGE_NODES ??
  "http://34.83.53.209:5678,http://34.169.28.106:5678,http://34.19.125.196:5678"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const OUTPUT_DIR = path.resolve(process.env.ZG_OUT_DIR ?? "./retrieved");

const FILES: Record<string, string> = {
  manifest: "0xc657c5d77399f089f2ffb4c3454e0280bd2a0d2a3fe153855c5c61d20c132e36",
  clean_article: "0x6c4feb11d2a8c6cf1dbb7bb4132cfdd6d23ff5ec8356b70a2d734272d2e71e01",
  statements: "0x9ca0cd5c9dc3dde230c8b1404e6852c86c588b0da5ccfec76093c4238af7ea31",
  verified_statements: "0x4255763e0f38fae3a6b3da09b7d6f9382f4b52df0194de56aff390fbcc39ad1d",
  retrieval_chunks: "0x81207bd7c30f7baa2af1e8d1e5d18c3649cec4ce698b05970dc81a5b4d0e993a",
  embeddings: "0xa540f599b37f427a6e2ce4b9f42e702039daf8b5abe7d67003c86d734e4503a7",
};

async function rpc(nodeUrl: string, method: string, params: unknown[]) {
  const res = await fetch(nodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  const text = await res.text();
  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from ${nodeUrl}: ${text.slice(0, 500)}`);
  }

  if (json.error) {
    throw new Error(
      `RPC error from ${nodeUrl}: ${JSON.stringify(json.error)}`
    );
  }

  return json.result;
}

async function findNodeForRoot(rootHash: string) {
  for (const nodeUrl of STORAGE_NODES) {
    try {
      const info = await rpc(nodeUrl, "zgs_getFileInfo", [rootHash, true]);
      if (info?.tx?.dataMerkleRoot?.toLowerCase() === rootHash.toLowerCase()) {
        return { nodeUrl, info };
      }
    } catch {
      // ignore and continue
    }
  }
  return null;
}

async function tryIndexerDownload(
  indexer: Indexer,
  rootHash: string,
  outputPath: string
) {
  try {
    const locations = await indexer.getFileLocations(rootHash);
    if (!locations || locations.length === 0) {
      return {
        ok: false as const,
        reason: "indexer returned no locations",
      };
    }

    const err = await indexer.download(rootHash, outputPath, true);
    if (err !== null) {
      return {
        ok: false as const,
        reason: `indexer download error: ${String(err)}`,
      };
    }

    return {
      ok: true as const,
      reason: "downloaded via indexer",
    };
  } catch (error) {
    return {
      ok: false as const,
      reason: `indexer exception: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function tryNodeHttpDownload(
  nodeUrl: string,
  rootHash: string,
  outputPath: string
) {
  const url = `${nodeUrl}/file?root=${encodeURIComponent(rootHash)}`;

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText} from ${url} ${body ? `| ${body.slice(0, 300)}` : ""}`
    );
  }

  if (!res.body) {
    throw new Error(`No response body from ${url}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const fileStream = fs.createWriteStream(outputPath);
  await pipeline(res.body as any, fileStream);

  const stat = fs.statSync(outputPath);
  if (stat.size === 0) {
    throw new Error(`Downloaded file is empty from ${url}`);
  }

  return { size: stat.size, url };
}

async function tryNodeFallbackDownload(
  rootHash: string,
  outputPath: string
) {
  const nodeMatch = await findNodeForRoot(rootHash);
  if (!nodeMatch) {
    return {
      ok: false as const,
      reason: "not found on known storage nodes",
    };
  }

  const { nodeUrl, info } = nodeMatch;

  try {
    const result = await tryNodeHttpDownload(nodeUrl, rootHash, outputPath);
    return {
      ok: true as const,
      reason: "downloaded via node fallback",
      nodeUrl,
      size: result.size,
      seq: info.tx.seq,
      finalized: info.finalized,
      pruned: info.pruned,
    };
  } catch (error) {
    return {
      ok: false as const,
      reason: `node fallback failed: ${error instanceof Error ? error.message : String(error)}`,
      nodeUrl,
      seq: info.tx.seq,
      size: info.tx.size,
      finalized: info.finalized,
      pruned: info.pruned,
    };
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const indexer = new Indexer(INDEXER_RPC);

  console.log(`[init] indexer: ${INDEXER_RPC}`);
  console.log(`[init] output:  ${OUTPUT_DIR}`);
  console.log(`[init] nodes:   ${STORAGE_NODES.join(", ")}`);

  const summary: Array<Record<string, unknown>> = [];

  for (const [name, rootHash] of Object.entries(FILES)) {
    const outputPath = path.join(OUTPUT_DIR, `${name}.json`);
    console.log(`\n[file] ${name}`);
    console.log(`  root: ${rootHash}`);

    const indexerResult = await tryIndexerDownload(indexer, rootHash, outputPath);

    if (indexerResult.ok) {
      const stat = fs.statSync(outputPath);
      console.log(`  ✓ downloaded via indexer -> ${outputPath} (${stat.size} bytes)`);
      summary.push({
        name,
        rootHash,
        status: "downloaded",
        method: "indexer",
        outputPath,
        size: stat.size,
      });
      continue;
    }

    console.log(`  ! indexer failed: ${indexerResult.reason}`);

    const nodeResult = await tryNodeFallbackDownload(rootHash, outputPath);

    if (nodeResult.ok) {
      console.log(
        `  ✓ downloaded via node fallback -> ${outputPath} (${nodeResult.size} bytes) from ${nodeResult.nodeUrl}`
      );
      summary.push({
        name,
        rootHash,
        status: "downloaded",
        method: "node_fallback",
        outputPath,
        nodeUrl: nodeResult.nodeUrl,
        size: nodeResult.size,
        seq: nodeResult.seq,
        finalized: nodeResult.finalized,
        pruned: nodeResult.pruned,
        reason: indexerResult.reason,
      });
      continue;
    }

    console.log(`  ✗ fallback failed: ${nodeResult.reason}`);

    if ("nodeUrl" in nodeResult) {
      summary.push({
        name,
        rootHash,
        status: "present_on_node",
        method: "node_lookup_only",
        nodeUrl: nodeResult.nodeUrl,
        seq: nodeResult.seq,
        size: nodeResult.size,
        finalized: nodeResult.finalized,
        pruned: nodeResult.pruned,
        reason: `${indexerResult.reason}; ${nodeResult.reason}`,
      });
    } else {
      summary.push({
        name,
        rootHash,
        status: "not_downloaded",
        method: "none",
        reason: `${indexerResult.reason}; ${nodeResult.reason}`,
      });
    }
  }

  const summaryPath = path.join(OUTPUT_DIR, "retrieve-summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  console.log(`\n[done] summary written to ${summaryPath}`);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
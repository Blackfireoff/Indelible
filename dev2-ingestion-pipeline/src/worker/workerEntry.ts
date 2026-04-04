/**
 * Dev 2 — event-driven worker (poller on Dev1 registry)
 *
 * Env:
 *   DEV1_REGISTRY_URL       — HTTPS JSON registry (preferred for prod)
 *   DEV1_REGISTRY_PATH      — or local JSON file (dev)
 *   WORKER_STATE_PATH       — default ./data/worker-state.json
 *   WORKER_POLL_INTERVAL_MS — default 30000
 *   WORKER_STALE_PROCESSING_MS — reclaim stuck "processing" after N ms (default 30 min)
 *   WORKER_MAX_RETRIES      — max failure count before giving up (default 5)
 *   STORAGE_ADAPTER, SKIP_STORAGE_VERIFY, 0G keys — same as `npm run pipeline`
 */

import { loadDotEnv } from "../utils/loadDotEnv.js";
loadDotEnv();

import { MockStorageAdapter } from "../adapters/storage/MockStorageAdapter.js";
import { ZeroGStorageAdapter } from "../adapters/storage/ZeroGStorageAdapter.js";
import type { StorageAdapter } from "../adapters/storage/StorageAdapter.js";
import { getWorkerLoopConfig, runWorkerPollCycle, sleep } from "./workerLoop.js";

function createAdapter(): StorageAdapter {
  const adapterType = process.env.STORAGE_ADAPTER ?? "mock";
  if (adapterType === "zerog") {
    console.log("[worker] Storage: 0G");
    return new ZeroGStorageAdapter();
  }
  const outputDir = process.env.OUTPUT_DIR ?? "./output";
  console.log(`[worker] Storage: mock (${outputDir})`);
  return new MockStorageAdapter(outputDir);
}

async function main(): Promise<void> {
  const cfg = getWorkerLoopConfig();
  console.log(
    `[worker] poll=${cfg.pollIntervalMs}ms stale=${cfg.staleProcessingMs}ms ` +
      `maxFailures=${cfg.maxRetries} skipVerify=${cfg.skipStorageVerify}`,
  );

  const adapter = createAdapter();

  let running = true;
  const onSig = () => {
    console.log("\n[worker] Shutting down …");
    running = false;
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  while (running) {
    try {
      await runWorkerPollCycle(adapter, cfg);
    } catch (err) {
      console.error("[worker] Poll error:", err instanceof Error ? err.message : err);
    }
    if (!running) break;
    await sleep(cfg.pollIntervalMs);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

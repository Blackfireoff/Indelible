import type { StorageAdapter } from "../adapters/storage/StorageAdapter.js";
import { loadRawCaptureForJob, runIngestionJob } from "../pipeline/runIngestionJob.js";
import { loadRegistry } from "./registrySource.js";
import { loadState, saveState, shouldProcess, upsertJob } from "./stateStore.js";
import type { RegistryItem, WorkerStateFile } from "./types.js";

function envInt(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface WorkerLoopConfig {
  pollIntervalMs: number;
  staleProcessingMs: number;
  maxRetries: number;
  skipStorageVerify: boolean;
}

export function getWorkerLoopConfig(): WorkerLoopConfig {
  return {
    pollIntervalMs: envInt("WORKER_POLL_INTERVAL_MS", 30_000),
    staleProcessingMs: envInt("WORKER_STALE_PROCESSING_MS", 30 * 60 * 1000),
    maxRetries: envInt("WORKER_MAX_RETRIES", 5),
    skipStorageVerify: process.env.SKIP_STORAGE_VERIFY === "true",
  };
}

async function processItem(
  adapter: StorageAdapter,
  item: RegistryItem,
  state: WorkerStateFile,
  cfg: WorkerLoopConfig,
): Promise<void> {
  const { id, rawCaptureDataAddress } = item;
  const decision = shouldProcess(state, id, cfg.staleProcessingMs, cfg.maxRetries);
  if (!decision.ok) {
    console.log(`[worker] Skip ${id}: ${decision.reason}`);
    return;
  }

  console.log(`[worker] Claim ${id} (${decision.reason}) → ${rawCaptureDataAddress}`);

  upsertJob(state, id, {
    status: "processing",
    rawCaptureDataAddress,
  });
  saveState(state);

  try {
    const rawCapture = await loadRawCaptureForJob(adapter, rawCaptureDataAddress);
    const result = await runIngestionJob(
      adapter,
      { rawCapture, rawCaptureDataAddress },
      { skipStorageVerify: cfg.skipStorageVerify },
    );

    upsertJob(state, id, {
      status: "done",
      rawCaptureDataAddress,
      manifestAddress: result.manifestAddress,
      lastError: undefined,
    });
    saveState(state);

    console.log(
      `[worker] Done ${id} | manifest: ${result.manifestAddress} | ` +
        `paragraphs: ${result.summary.paragraphCount} | statements: ${result.summary.statementCount}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const prev = state.jobs[id];
    const attemptCount = (prev?.attemptCount ?? 0) + 1;

    upsertJob(state, id, {
      status: "failed",
      rawCaptureDataAddress,
      attemptCount,
      lastError: msg.slice(0, 2000),
    });
    saveState(state);

    console.error(`[worker] Failed ${id} (attempt ${attemptCount}/${cfg.maxRetries}): ${msg}`);
  }
}

/**
 * One poll cycle: fetch registry, process each item sequentially (avoids parallel 0G / embedding contention).
 */
export async function runWorkerPollCycle(
  adapter: StorageAdapter,
  cfg: WorkerLoopConfig,
): Promise<void> {
  const items = await loadRegistry();
  if (items.length === 0) {
    return;
  }

  const state = loadState();
  console.log(`[worker] Registry: ${items.length} item(s), state: ${Object.keys(state.jobs).length} job(s)`);

  for (const item of items) {
    await processItem(adapter, item, state, cfg);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

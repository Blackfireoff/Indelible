import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "fs";
import { dirname } from "path";
import type { WorkerStateFile, JobRecord } from "./types.js";

const DEFAULT_PATH = "./data/worker-state.json";

export function getStatePath(): string {
  return process.env.WORKER_STATE_PATH ?? DEFAULT_PATH;
}

export function loadState(): WorkerStateFile {
  const p = getStatePath();
  if (!existsSync(p)) {
    return { schemaVersion: 1, jobs: {} };
  }
  try {
    const raw = readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as WorkerStateFile;
    if (!parsed.jobs || typeof parsed.jobs !== "object") {
      return { schemaVersion: 1, jobs: {} };
    }
    return parsed;
  } catch {
    console.warn(`[worker] Corrupt state file ${p} — starting fresh`);
    return { schemaVersion: 1, jobs: {} };
  }
}

export function saveState(state: WorkerStateFile): void {
  const p = getStatePath();
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  const json = JSON.stringify(state, null, 2);
  writeFileSync(tmp, json, "utf-8");
  renameSync(tmp, p);
}

export function getJob(state: WorkerStateFile, id: string): JobRecord | undefined {
  return state.jobs[id];
}

export function upsertJob(
  state: WorkerStateFile,
  id: string,
  patch: Partial<JobRecord> & Pick<JobRecord, "status" | "rawCaptureDataAddress">,
): void {
  const prev = state.jobs[id];
  const next: JobRecord = {
    status: patch.status,
    updatedAt: new Date().toISOString(),
    rawCaptureDataAddress: patch.rawCaptureDataAddress,
    attemptCount: patch.attemptCount ?? prev?.attemptCount ?? 0,
    manifestAddress: patch.manifestAddress ?? prev?.manifestAddress,
    lastError:
      patch.lastError !== undefined
        ? patch.lastError
        : patch.status === "done"
          ? undefined
          : prev?.lastError,
  };
  state.jobs[id] = next;
}

export function shouldProcess(
  state: WorkerStateFile,
  id: string,
  staleProcessingMs: number,
  maxRetries: number,
): { ok: boolean; reason: string } {
  const j = state.jobs[id];
  if (!j) {
    return { ok: true, reason: "new" };
  }
  if (j.status === "done") {
    return { ok: false, reason: "already done" };
  }
  if (j.status === "failed" && j.attemptCount >= maxRetries) {
    return { ok: false, reason: `max failures (${maxRetries})` };
  }
  if (j.status === "pending") {
    return { ok: true, reason: "pending — process" };
  }
  if (j.status === "processing") {
    const age = Date.now() - new Date(j.updatedAt).getTime();
    if (age < staleProcessingMs) {
      return { ok: false, reason: "still processing (in-flight)" };
    }
    return { ok: true, reason: "stale processing — retry" };
  }
  return { ok: true, reason: "retry pending/failed" };
}

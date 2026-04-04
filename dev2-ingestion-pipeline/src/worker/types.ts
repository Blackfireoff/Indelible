/**
 * Worker job model — separate from pipeline schemas.
 */

export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface RegistryItem {
  /** Stable id from Dev1 — primary idempotency key (e.g. attestationId or requestId) */
  id: string;
  /** 0G root hash where Dev1 stored raw_capture.json */
  rawCaptureDataAddress: string;
}

/** Supported registry JSON shapes from Dev1 */
export interface RegistryFileV1 {
  schemaVersion?: "1";
  items: RegistryItem[];
}

export interface JobRecord {
  status: JobStatus;
  updatedAt: string;
  rawCaptureDataAddress: string;
  attemptCount: number;
  manifestAddress?: string;
  lastError?: string;
}

export interface WorkerStateFile {
  schemaVersion: 1;
  jobs: Record<string, JobRecord>;
}

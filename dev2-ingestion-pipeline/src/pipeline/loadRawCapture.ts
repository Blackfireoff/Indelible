import { readFileSync } from "fs";
import type { RawCapture } from "../schemas/rawCapture.js";
import { isRawCapture } from "../schemas/rawCapture.js";
import type { StorageAdapter } from "../adapters/storage/StorageAdapter.js";

/**
 * Load a RawCapture artifact either from a local JSON file (dev/test)
 * or by downloading it from 0G Storage via dataAddress.
 */
export async function loadRawCaptureFromFile(filePath: string): Promise<RawCapture> {
  const raw = readFileSync(filePath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  const normalized = normalizeRawCapture(parsed);
  assertRawCapture(normalized);
  return normalized;
}

export async function loadRawCaptureFromStorage(
  adapter: StorageAdapter,
  dataAddress: string
): Promise<RawCapture> {
  const data = await adapter.downloadArtifact(dataAddress);
  const parsed: unknown = typeof data === "string" ? JSON.parse(data) : data;
  const normalized = normalizeRawCapture(parsed);
  assertRawCapture(normalized);
  return normalized;
}

function normalizeRawCapture(value: unknown): unknown {
  if (isRawCapture(value)) {
    return value;
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const input = value as Record<string, unknown>;
  const attestationId = input.attestationId;
  const requestId = input.requestId;
  const sourceUrl = input.sourceUrl ?? input.url;
  const observedAt = input.observedAt ?? input.observed_at;
  const contentType = input.contentType ?? input.content_type;
  const rawHash = input.rawHash ?? input.raw_hash;
  const dataBrut = input.dataBrut ?? input.data_brut;

  return {
    schemaVersion: "1.0",
    attestationId,
    requestId,
    sourceUrl,
    observedAt,
    contentType,
    rawHash,
    dataBrut,
  } satisfies Partial<RawCapture>;
}

function assertRawCapture(value: unknown): asserts value is RawCapture {
  if (!isRawCapture(value)) {
    throw new Error(
      "Invalid RawCapture artifact – missing required fields or wrong schemaVersion. " +
      "Expected { schemaVersion: '1.0', attestationId, requestId, sourceUrl, " +
      "observedAt, contentType: 'text/html', rawHash, dataBrut } " +
      "(or Dev1 format with snake_case fields: url, observed_at, content_type, raw_hash, data_brut)."
    );
  }
}

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
  assertRawCapture(parsed);
  return parsed;
}

export async function loadRawCaptureFromStorage(
  adapter: StorageAdapter,
  dataAddress: string
): Promise<RawCapture> {
  const data = await adapter.downloadArtifact(dataAddress);
  const parsed: unknown = typeof data === "string" ? JSON.parse(data) : data;
  assertRawCapture(parsed);
  return parsed;
}

function assertRawCapture(value: unknown): asserts value is RawCapture {
  if (!isRawCapture(value)) {
    throw new Error(
      "Invalid RawCapture artifact – missing required fields or wrong schemaVersion. " +
      "Expected { schemaVersion: '1.0', attestationId, requestId, sourceUrl, " +
      "observedAt, contentType: 'text/html', rawHash, dataBrut }."
    );
  }
}

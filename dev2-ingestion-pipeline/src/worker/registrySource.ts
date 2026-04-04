import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { RegistryItem, RegistryFileV1 } from "./types.js";

function isRegistryItem(x: unknown): x is RegistryItem {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id.length > 0 &&
    typeof o.rawCaptureDataAddress === "string" &&
    o.rawCaptureDataAddress.length > 0
  );
}

/**
 * Parse registry JSON — supports:
 * - `{ "schemaVersion": "1", "items": [ { "id", "rawCaptureDataAddress" } ] }`
 * - `[ { "id", "rawCaptureDataAddress" }, ... ]`
 */
export function parseRegistryJson(text: string): RegistryItem[] {
  const parsed: unknown = JSON.parse(text);
  let list: unknown[];

  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (typeof parsed === "object" && parsed !== null && "items" in parsed) {
    const f = parsed as RegistryFileV1;
    list = Array.isArray(f.items) ? f.items : [];
  } else {
    throw new Error("Registry JSON must be an array or { items: [...] }");
  }

  const out: RegistryItem[] = [];
  for (const el of list) {
    if (!isRegistryItem(el)) {
      console.warn("[worker] Skipping invalid registry item:", JSON.stringify(el).slice(0, 120));
      continue;
    }
    out.push({
      id: el.id.trim(),
      rawCaptureDataAddress: el.rawCaptureDataAddress.trim(),
    });
  }
  return out;
}

/** Fetch registry from HTTP(S) */
export async function fetchRegistryFromUrl(url: string): Promise<RegistryItem[]> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Registry HTTP ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return parseRegistryJson(text);
}

export function readRegistryFromFile(filePath: string): RegistryItem[] {
  const p = resolve(process.cwd(), filePath);
  if (!existsSync(p)) {
    throw new Error(`Registry file not found: ${p}`);
  }
  const text = readFileSync(p, "utf-8");
  return parseRegistryJson(text);
}

/**
 * Load registry: `DEV1_REGISTRY_URL` wins, else `DEV1_REGISTRY_PATH`, else empty.
 */
export async function loadRegistry(): Promise<RegistryItem[]> {
  const url = process.env.DEV1_REGISTRY_URL?.trim();
  if (url) {
    console.log(`[worker] Fetching registry: ${url}`);
    return fetchRegistryFromUrl(url);
  }
  const path = process.env.DEV1_REGISTRY_PATH?.trim();
  if (path) {
    console.log(`[worker] Reading registry file: ${path}`);
    return readRegistryFromFile(path);
  }
  console.warn(
    "[worker] No DEV1_REGISTRY_URL or DEV1_REGISTRY_PATH — nothing to poll. " +
      "Set one of them to a Dev1-published registry.",
  );
  return [];
}

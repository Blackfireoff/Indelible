import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

/**
 * Read and parse a JSON file. Throws descriptive errors on failure.
 */
export function readJsonFile<T = unknown>(filePath: string): T {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(`Failed to read JSON from "${filePath}": ${(err as Error).message}`);
  }
}

/**
 * Write a JSON artifact to disk, creating parent directories as needed.
 */
export function writeJsonFile(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Safe JSON stringify – handles circular references by replacing them with
 * the string "[Circular]".
 */
export function safeStringify(data: unknown, indent = 2): string {
  const seen = new WeakSet();
  return JSON.stringify(
    data,
    (_, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    },
    indent
  );
}

/**
 * Parse a JSON string, returning null instead of throwing on malformed input.
 */
export function safeParseJson<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

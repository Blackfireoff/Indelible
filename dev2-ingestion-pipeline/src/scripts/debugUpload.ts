/**
 * Debug script: test upload + download via ZeroGStorageAdapter (starter-kit–aligned path).
 *
 * Usage: npm run debug-upload
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { ZeroGStorageAdapter } from "../adapters/storage/ZeroGStorageAdapter.js";

function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

if (!process.env.ZEROG_PRIVATE_KEY) {
  console.error("ZEROG_PRIVATE_KEY not set in .env");
  process.exit(1);
}

const adapter = new ZeroGStorageAdapter();

const testData = JSON.stringify({ test: true, timestamp: Date.now() });
console.log("\n=== 0G Upload Diagnostic (ZeroGStorageAdapter) ===");
console.log(`Payload: ${testData}`);

const rootHash = await adapter.uploadArtifact("debug-upload.json", testData);
console.log(`\nRoot hash returned: ${rootHash}`);

console.log("\n--- Downloading to verify round-trip … ---");
const downloaded = await adapter.downloadArtifact(rootHash);

if (downloaded === testData) {
  console.log("✓ Round-trip OK – content matches exactly");
} else {
  console.warn("⚠ Content mismatch after trimEnd");
  console.warn("  expected:", testData);
  console.warn("  got:     ", downloaded);
}

console.log("\n--- Done ---");

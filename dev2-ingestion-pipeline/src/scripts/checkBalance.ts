/**
 * Check the A0GI balance of the configured wallet on 0G Galileo testnet.
 * Usage: npm run check-balance
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load .env
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

import { ZeroGStorageAdapter } from "../adapters/storage/ZeroGStorageAdapter.js";

const adapter = new ZeroGStorageAdapter();
await adapter.checkBalance();

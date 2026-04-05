#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dev1Dir = path.join(rootDir, "dev1_existance_proof");
const dev2Dir = path.join(rootDir, "dev2-ingestion-pipeline");
const dataDir = path.join(rootDir, "data");
const rootEnvPath = path.join(rootDir, ".env");
const rootEnvLocalPath = path.join(rootDir, ".env.local");

function printUsage() {
  console.log("Usage: npm run pipeline:chain -- <url>");
  console.log("Example:");
  console.log(
    "  npm run pipeline:chain -- https://www.reuters.com/legal/government/trump-issues-executive-order-bolster-college-sports-rules-2026-04-03/",
  );
}

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: true,
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function parseEnv(content) {
  const env = {};
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    if (!key) continue;

    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }
  return env;
}

async function loadUnifiedRootEnv() {
  const merged = {};
  const orderedCandidates = [rootEnvPath, rootEnvLocalPath];

  for (const envFilePath of orderedCandidates) {
    try {
      const content = await fs.readFile(envFilePath, "utf-8");
      Object.assign(merged, parseEnv(content));
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  return merged;
}

function normalizeEnvAliases(env) {
  const out = { ...env };

  if (!out.ZEROG_PRIVATE_KEY && out.PRIVATE_KEY) {
    out.ZEROG_PRIVATE_KEY = out.PRIVATE_KEY;
  }
  if (!out.PRIVATE_KEY && out.ZEROG_PRIVATE_KEY) {
    out.PRIVATE_KEY = out.ZEROG_PRIVATE_KEY;
  }

  if (!out.ZEROG_RPC_URL && out.ZG_RPC_URL) {
    out.ZEROG_RPC_URL = out.ZG_RPC_URL;
  }
  if (!out.ZG_RPC_URL && out.ZEROG_RPC_URL) {
    out.ZG_RPC_URL = out.ZEROG_RPC_URL;
  }

  if (!out.ZEROG_INDEXER_URL && out.ZG_INDEXER_URL) {
    out.ZEROG_INDEXER_URL = out.ZG_INDEXER_URL;
  }
  if (!out.ZG_INDEXER_URL && out.ZEROG_INDEXER_URL) {
    out.ZG_INDEXER_URL = out.ZEROG_INDEXER_URL;
  }

  return out;
}

function hasNonEmpty(env, key) {
  const value = env[key];
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

function printEnvDiagnostics(env) {
  console.log("[chain][env] Effective runtime flags:");
  console.log(`  STORAGE_ADAPTER=${env.STORAGE_ADAPTER ?? "(unset -> dev2 default mock)"}`);
  console.log(`  USE_REAL_0G_STORAGE=${env.USE_REAL_0G_STORAGE ?? "(unset -> dev1 default mock)"}`);
  console.log(`  ZEROG_RPC_URL set: ${hasNonEmpty(env, "ZEROG_RPC_URL")}`);
  console.log(`  ZEROG_INDEXER_URL set: ${hasNonEmpty(env, "ZEROG_INDEXER_URL")}`);
  console.log(`  ZEROG_PRIVATE_KEY set: ${hasNonEmpty(env, "ZEROG_PRIVATE_KEY")}`);
}

async function listJsonFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);
}

async function pickNewestJsonPath(directory, names) {
  const withStats = await Promise.all(
    names.map(async (name) => {
      const fullPath = path.join(directory, name);
      const stat = await fs.stat(fullPath);
      return { fullPath, mtimeMs: stat.mtimeMs };
    }),
  );

  if (withStats.length === 0) {
    return null;
  }

  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withStats[0].fullPath;
}

async function main() {
  const url = process.argv[2];
  if (!url || url === "--help" || url === "-h") {
    printUsage();
    process.exit(url ? 0 : 1);
  }

  const unifiedRootEnv = await loadUnifiedRootEnv();
  const childEnv = normalizeEnvAliases({
    ...unifiedRootEnv,
    ...process.env,
  });

  printEnvDiagnostics(childEnv);

  console.log("[chain] Starting Dev1 workflow...");
  const filesBefore = new Set(await listJsonFiles(dataDir));

  await runCommand("npx", ["tsx", "workflow/index.ts", url], {
    cwd: dev1Dir,
    env: childEnv,
  });

  const filesAfter = await listJsonFiles(dataDir);
  const createdNow = filesAfter.filter((name) => !filesBefore.has(name));

  let rawCapturePath = await pickNewestJsonPath(dataDir, createdNow);
  if (!rawCapturePath) {
    rawCapturePath = await pickNewestJsonPath(dataDir, filesAfter);
    if (!rawCapturePath) {
      throw new Error("No JSON file found in ./data after Dev1 execution.");
    }
    console.warn(
      "[chain] No newly created JSON detected, falling back to latest JSON in ./data.",
    );
  }

  console.log(`[chain] RAW_CAPTURE_PATH -> ${rawCapturePath}`);
  console.log("[chain] Starting Dev2 pipeline...");

  await runCommand("npm", ["run", "pipeline"], {
    cwd: dev2Dir,
    env: {
      ...childEnv,
      RAW_CAPTURE_PATH: rawCapturePath,
    },
  });

  console.log("[chain] Done.");
}

main().catch((error) => {
  console.error("[chain] Failed:", error);
  process.exit(1);
});

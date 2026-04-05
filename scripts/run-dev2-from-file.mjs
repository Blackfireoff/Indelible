#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dev2Dir = path.join(rootDir, "dev2-ingestion-pipeline");

function printUsage() {
  console.log("Usage: npm run pipeline:dev2:file -- <raw-capture-json-path>");
  console.log("Example:");
  console.log("  npm run pipeline:dev2:file -- data/2026-04-05_01-55-56.json");
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

async function main() {
  const inputPathArg = process.argv[2];
  if (!inputPathArg || inputPathArg === "--help" || inputPathArg === "-h") {
    printUsage();
    process.exit(inputPathArg ? 0 : 1);
  }

  const resolvedPath = path.resolve(rootDir, inputPathArg);
  await fs.access(resolvedPath);

  console.log(`[dev2:file] RAW_CAPTURE_PATH -> ${resolvedPath}`);
  await runCommand("npm", ["run", "pipeline"], {
    cwd: dev2Dir,
    env: {
      ...process.env,
      RAW_CAPTURE_PATH: resolvedPath,
    },
  });
}

main().catch((error) => {
  console.error("[dev2:file] Failed:", error);
  process.exit(1);
});

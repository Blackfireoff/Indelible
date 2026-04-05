#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const sources = [
  {
    label: "dev1_existance_proof",
    filePath: path.join(rootDir, "dev1_existance_proof", ".env"),
  },
  {
    label: "dev2-ingestion-pipeline",
    filePath: path.join(rootDir, "dev2-ingestion-pipeline", ".env"),
  },
];

const targetPath = path.join(rootDir, ".env");

function parseEnv(content) {
  const values = new Map();
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    if (!key) continue;

    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values.set(key, value);
  }
  return values;
}

function serializeValue(value) {
  if (value === "") return '""';
  if (/\s|#/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

async function tryReadEnv(filePath) {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const merged = new Map();
  const foundSources = [];

  for (const source of sources) {
    const content = await tryReadEnv(source.filePath);
    if (!content) continue;

    foundSources.push(source.label);
    const parsed = parseEnv(content);
    for (const [key, value] of parsed.entries()) {
      merged.set(key, value);
    }
  }

  if (foundSources.length === 0) {
    throw new Error("No source .env found in dev1_existance_proof or dev2-ingestion-pipeline.");
  }

  const lines = [
    "# Unified env for chained dev1 -> dev2 pipeline",
    `# Generated from: ${foundSources.join(", ")}`,
    "",
  ];

  const sortedKeys = [...merged.keys()].sort((a, b) => a.localeCompare(b));
  for (const key of sortedKeys) {
    lines.push(`${key}=${serializeValue(merged.get(key) ?? "")}`);
  }

  lines.push("");
  await fs.writeFile(targetPath, lines.join("\n"), "utf-8");

  console.log(`[env] Merged ${sortedKeys.length} keys into ${targetPath}`);
  console.log("[env] Existing subproject .env files are unchanged.");
}

main().catch((error) => {
  console.error("[env] Merge failed:", error);
  process.exit(1);
});

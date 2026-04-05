/**
 * Simule l’artefact « brut » tel qu’il serait stocké (0G / côté Dev1) : JSON RawCapture + extrait de registre.
 *
 * Usage (depuis la racine du repo, avec tsx installé globalement ou via dev2-ingestion-pipeline) :
 *   cd dev2-ingestion-pipeline && npx tsx ../trash/transformer.ts ../example4.html
 *   npx tsx ../trash/transformer.ts ../example4.html --out ../trash/chain-sim
 *
 * Options :
 *   --out <dir>          dossier de sortie (défaut : <dossier-html>/chain-sim)
 *   --source-url <url>   URL canonique (défaut : file://… ou https://example.invalid/local)
 *   --registry-id <id>   id dans le registre (défaut : dérivé du hash)
 *   --crlf               forcer \\r\\n dans dataBrut (comme le fixture Reuters)
 */

import { createHash, randomBytes } from "crypto";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { basename, dirname, resolve } from "path";
import { pathToFileURL } from "url";

function hex0x32(bytes: Buffer): string {
  return `0x${bytes.toString("hex")}`;
}

/** Empreinte du contenu (simulation ; en prod Dev1 peut utiliser keccak256 / attestation on-chain). */
function hashPayload(utf8: string): string {
  return hex0x32(createHash("sha256").update(utf8, "utf8").digest());
}

function randomHex32(): string {
  return hex0x32(randomBytes(32));
}

function parseArgs(argv: string[]): {
  input: string;
  outDir?: string;
  sourceUrl?: string;
  registryId?: string;
  crlf: boolean;
} {
  const rest = argv.slice(2).filter((a) => a !== "--");
  let outDir: string | undefined;
  let sourceUrl: string | undefined;
  let registryId: string | undefined;
  let crlf = false;
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--out") {
      outDir = rest[++i];
      continue;
    }
    if (a === "--source-url") {
      sourceUrl = rest[++i];
      continue;
    }
    if (a === "--registry-id") {
      registryId = rest[++i];
      continue;
    }
    if (a === "--crlf") {
      crlf = true;
      continue;
    }
    if (!a.startsWith("-")) positional.push(a);
  }

  if (positional.length === 0) {
    console.error(
      "Usage: tsx transformer.ts <fichier.html> [--out <dir>] [--source-url <url>] [--registry-id <id>] [--crlf]",
    );
    process.exit(1);
  }

  return {
    input: resolve(positional[0]!),
    outDir,
    sourceUrl,
    registryId,
    crlf,
  };
}

export interface RawCaptureV1 {
  schemaVersion: "1.0";
  attestationId: string;
  requestId: string;
  sourceUrl: string;
  observedAt: string;
  contentType: "text/html";
  rawHash: string;
  dataBrut: string;
}

function main(): void {
  const { input, outDir: outArg, sourceUrl: urlArg, registryId: regArg, crlf } = parseArgs(process.argv);
  const htmlRaw = readFileSync(input, "utf-8");
  const dataBrut = crlf ? htmlRaw.replace(/\r?\n/g, "\r\n") : htmlRaw;

  const rawHash = hashPayload(dataBrut);
  const attestationId = randomHex32();
  const requestId = randomHex32();

  const defaultSource =
    urlArg ??
    (() => {
      try {
        return pathToFileURL(input).href;
      } catch {
        return "https://example.invalid/local";
      }
    })();

  const observedAt = new Date().toISOString();

  const capture: RawCaptureV1 = {
    schemaVersion: "1.0",
    attestationId,
    requestId,
    sourceUrl: defaultSource,
    observedAt,
    contentType: "text/html",
    rawHash,
    dataBrut,
  };

  const outDir = resolve(outArg ?? resolve(dirname(input), "chain-sim"));
  mkdirSync(outDir, { recursive: true });

  const base = basename(input, ".html") || "page";
  const rawPath = resolve(outDir, `${base}_raw_capture.json`);
  writeFileSync(rawPath, `${JSON.stringify(capture, null, 2)}\n`, "utf-8");

  const short = rawHash.slice(2, 10);
  const registryId = regArg ?? `html-${short}`;
  const registry = {
    schemaVersion: "1" as const,
    items: [
      {
        id: registryId,
        rawCaptureDataAddress: "REPLACE_WITH_0G_ROOT_HASH_AFTER_DEV1_UPLOAD",
      },
    ],
  };

  const regPath = resolve(outDir, `${base}_registry.json`);
  writeFileSync(regPath, `${JSON.stringify(registry, null, 2)}\n`, "utf-8");

  console.log(`Écrit :`);
  console.log(`  ${rawPath}`);
  console.log(`  ${regPath}`);
  console.log(`rawHash: ${rawHash}`);
  console.log(`attestationId: ${attestationId}`);
  console.log(`requestId: ${requestId}`);
  console.log(`dataBrut: ${(dataBrut.length / 1024).toFixed(1)} KB`);
}

main();

/**
 * Generate example verified_statements.json for the Reuters fixture.
 * Used to produce the documented example output artifact.
 *
 * Usage: npm run generate-reuters-example
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";

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
process.env.EMBEDDING_PROVIDER = "stub";

import { extractMainArticle } from "../pipeline/extractMainArticle.js";
import { buildCleanArticle } from "../pipeline/buildCleanArticle.js";
import { extractStatements } from "../pipeline/extractStatements.js";
import { validateStatements, buildParagraphMap } from "../pipeline/validateStatements.js";
import { deterministicStatementsToRefined } from "../pipeline/verifyRefinedStatements.js";
import type { RawCapture } from "../schemas/rawCapture.js";
import type { RefinedStatementsArtifact } from "../schemas/refinedStatements.js";

const reutersHtmlPath = resolve(process.cwd(), "../example.html");
if (!existsSync(reutersHtmlPath)) {
  console.error("example.html not found at:", reutersHtmlPath);
  process.exit(1);
}

const html = readFileSync(reutersHtmlPath, "utf-8");

const rawCapture: RawCapture = {
  schemaVersion: "1.0",
  attestationId: "0xreuters_example_attestation_hormuz_2026_04_03",
  requestId: "0xreuters_example_req_hormuz_2026_04_03",
  sourceUrl: "https://www.reuters.com/world/trump-us-can-take-strait-hormuz-with-more-time-2026-04-03/",
  observedAt: "2026-04-03T18:00:00Z",
  contentType: "text/html",
  rawHash: "0xreuters_example_hash",
  dataBrut: html,
};

console.log("Extracting Reuters article …");
const extracted = await extractMainArticle(html, rawCapture.sourceUrl);
const cleanArticle = buildCleanArticle(rawCapture, extracted);

console.log(`Title:     ${cleanArticle.title}`);
console.log(`Publisher: ${cleanArticle.publisher}`);
console.log(`Date:      ${cleanArticle.publishedAt}`);
console.log(`Paras:     ${cleanArticle.paragraphs.length}`);

const rawStmts = await extractStatements(cleanArticle.paragraphs, rawCapture.attestationId, {
  useLlmFallback: false,
});
const paragraphMap = buildParagraphMap(cleanArticle.paragraphs);
const validated = validateStatements(rawStmts, paragraphMap);
const refined = deterministicStatementsToRefined(validated);

console.log(`Statements: ${refined.length} (deterministic, all verified)`);

const artifact: RefinedStatementsArtifact = {
  schemaVersion: "1.0",
  attestationId: rawCapture.attestationId,
  requestId: rawCapture.requestId,
  sourceUrl: rawCapture.sourceUrl,
  llm_used: false,
  llm_model: null,
  statements: refined,
  extraction_summary: {
    total: refined.length,
    verified: refined.length,
    unverified: 0,
  },
};

const outPath = resolve(process.cwd(), "output/reuters_verified_statements.json");
writeFileSync(outPath, JSON.stringify(artifact, null, 2), "utf-8");
console.log(`\nWritten to: ${outPath}`);
console.log("\nSample statements:");
for (const s of refined) {
  console.log(`  [${s.statement_type}] ${s.speaker ?? "(unknown)"}: "${s.statement_text.slice(0, 80)}…"`);
}

/**
 * Reuters fixture loader for integration tests.
 *
 * Loads the saved Reuters "Trump / Strait of Hormuz" HTML from the project root
 * and wraps it in a RawCapture envelope for pipeline testing.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import type { RawCapture } from "../schemas/rawCapture.js";

/** Locate the example.html relative to this file or the project root. */
function findReutersHtml(): string {
  const candidates = [
    resolve(join(import.meta.dirname ?? __dirname, "../../../example.html")),
    resolve("example.html"),
    resolve("../example.html"),
    resolve("../../example.html"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    "Reuters example.html not found. Expected at project root (../../example.html relative to fixtures/)."
  );
}

export function loadReutersRawCapture(): RawCapture {
  const htmlPath = findReutersHtml();
  const html = readFileSync(htmlPath, "utf-8");

  return {
    schemaVersion: "1.0",
    attestationId: "0xreuters_test_attestation_hormuz_2026_04_03",
    requestId: "0xreuters_test_request_hormuz_2026_04_03",
    sourceUrl: "https://www.reuters.com/world/trump-us-can-take-strait-hormuz-with-more-time-2026-04-03/",
    observedAt: "2026-04-03T18:00:00Z",
    contentType: "text/html",
    rawHash: "0xreuters_test_hash_placeholder",
    dataBrut: html,
  };
}

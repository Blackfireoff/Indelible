/**
 * Tests for main article extraction (Readability + fallback DOM walk)
 * and clean_article.json generation.
 */

import { describe, it, expect } from "@jest/globals";
import { readFileSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { extractMainArticle } from "../pipeline/extractMainArticle.js";
import { buildCleanArticle } from "../pipeline/buildCleanArticle.js";
import type { RawCapture } from "../schemas/rawCapture.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, "../fixtures");

// ── Load the sample article HTML ─────────────────────────────────────────────

const sampleHtml = readFileSync(join(FIXTURES_DIR, "sample-article.html"), "utf-8");

const sampleCapture: RawCapture = {
  schemaVersion: "1.0",
  attestationId: "0xtest_attestation_001",
  requestId: "0xtest_request_001",
  sourceUrl: "https://example.com/test-article",
  observedAt: "2026-04-04T12:00:00Z",
  contentType: "text/html",
  rawHash: "0xtest_hash_001",
  dataBrut: sampleHtml,
};

// ── extractMainArticle ────────────────────────────────────────────────────────

describe("extractMainArticle", () => {
  it("returns a result with paragraphs", async () => {
    const result = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    expect(result.paragraphs.length).toBeGreaterThan(0);
  });

  it("extracts the article title", async () => {
    const result = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    expect(result.title).toBeTruthy();
    expect(result.title).toContain("Trump");
  });

  it("returns paragraphs with non-empty text", async () => {
    const result = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    for (const para of result.paragraphs) {
      expect(para.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not include navigation/footer boilerplate", async () => {
    const result = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const fullText = result.paragraphs.map((p) => p.text).join(" ");
    // Nav and footer content should be excluded
    expect(fullText).not.toContain("Privacy Policy");
    expect(fullText).not.toContain("Terms of Service");
  });

  it("contains known article content", async () => {
    const result = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const fullText = result.paragraphs.map((p) => p.text).join(" ");
    expect(fullText).toContain("Strait of Hormuz");
  });
});

// ── buildCleanArticle ─────────────────────────────────────────────────────────

describe("buildCleanArticle", () => {
  it("produces a clean article with correct schema version", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    expect(clean.schemaVersion).toBe("1.0");
  });

  it("preserves attestationId and sourceUrl", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    expect(clean.attestationId).toBe(sampleCapture.attestationId);
    expect(clean.sourceUrl).toBe(sampleCapture.sourceUrl);
  });

  it("assigns ordered paragraphIds", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);

    expect(clean.paragraphs.length).toBeGreaterThan(0);
    clean.paragraphs.forEach((para, idx) => {
      expect(para.order).toBe(idx + 1);
      expect(para.paragraphId).toMatch(/^para_[0-9a-f]+$/);
    });
  });

  it("paragraph charStart/charEnd match text in fullText", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);

    for (const para of clean.paragraphs) {
      const slice = clean.fullText.slice(para.charStart, para.charEnd);
      expect(slice).toBe(para.text);
    }
  });

  it("fullText equals paragraphs joined by \\n\\n", async () => {
    const extracted = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean = buildCleanArticle(sampleCapture, extracted);
    const expected = clean.paragraphs.map((p) => p.text).join("\n\n");
    expect(clean.fullText).toBe(expected);
  });

  it("paragraphIds are deterministic across runs", async () => {
    const extracted1 = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const extracted2 = await extractMainArticle(sampleHtml, sampleCapture.sourceUrl);
    const clean1 = buildCleanArticle(sampleCapture, extracted1);
    const clean2 = buildCleanArticle(sampleCapture, extracted2);

    expect(clean1.paragraphs.map((p) => p.paragraphId)).toEqual(
      clean2.paragraphs.map((p) => p.paragraphId)
    );
  });
});

// ── Reuters fixture (integration test) ───────────────────────────────────────

const reutersHtmlPath = resolve(__dirname, "../../../example.html");
const reutersAvailable = existsSync(reutersHtmlPath);

(reutersAvailable ? describe : describe.skip)(
  "extractMainArticle – Reuters fixture",
  () => {
    const reutersHtml = reutersAvailable
      ? readFileSync(reutersHtmlPath, "utf-8")
      : "";

    const reutersCapture: RawCapture = {
      schemaVersion: "1.0",
      attestationId: "0xreuters_test",
      requestId: "0xreuters_req_test",
      sourceUrl: "https://www.reuters.com/",
      observedAt: "2026-04-01T13:13:39Z",
      contentType: "text/html",
      rawHash: "0xreuters_hash_test",
      dataBrut: reutersHtml,
    };

    it("extracts at least 5 paragraphs from Reuters HTML", async () => {
      const result = await extractMainArticle(reutersHtml, reutersCapture.sourceUrl);
      expect(result.paragraphs.length).toBeGreaterThanOrEqual(5);
    });

    it("extracts a non-empty title from Reuters HTML", async () => {
      const result = await extractMainArticle(reutersHtml, reutersCapture.sourceUrl);
      expect(result.title).toBeTruthy();
      expect(result.title!.length).toBeGreaterThan(5);
    });

    it("extracts Iran-related content", async () => {
      const result = await extractMainArticle(reutersHtml, reutersCapture.sourceUrl);
      const fullText = result.paragraphs.map((p) => p.text).join(" ");
      expect(fullText.toLowerCase()).toContain("iran");
    });

    it("produces a clean article with valid offsets from Reuters HTML", async () => {
      const extracted = await extractMainArticle(reutersHtml, reutersCapture.sourceUrl);
      const clean = buildCleanArticle(reutersCapture, extracted);

      for (const para of clean.paragraphs) {
        const slice = clean.fullText.slice(para.charStart, para.charEnd);
        expect(slice).toBe(para.text);
      }
    });
  }
);

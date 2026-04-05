/**
 * Reuters example.html – mandatory end-to-end extraction test.
 *
 * This fixture is required to pass. It verifies HTML → clean article and,
 * for statements, uses the deterministic `extractStatements` helper so tests
 * stay reproducible without a live LLM (the main job uses LLM extraction).
 *
 * Fixture: <repo-root>/example.html  (content may change when the file is updated)
 * Current article: "US to leave Iran 'pretty quickly' and return if needed, Trump tells Reuters"
 *   Author: Steve Holland
 */

import { describe, it, expect } from "@jest/globals";
import { readFileSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";

import { extractMainArticle } from "../pipeline/extractMainArticle.js";
import { buildCleanArticle } from "../pipeline/buildCleanArticle.js";
import { extractStatements } from "../pipeline/extractStatements.js";
import { validateStatements, buildParagraphMap } from "../pipeline/validateStatements.js";
import { deterministicStatementsToRefined } from "../pipeline/verifyRefinedStatements.js";
import type { RawCapture } from "../schemas/rawCapture.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Locate example.html – it lives at the repo root
const REUTERS_HTML_PATH = resolve(__dirname, "../../../example.html");
const AVAILABLE = existsSync(REUTERS_HTML_PATH);

const reutersCapture: RawCapture = {
  schemaVersion: "1.0",
  attestationId: "0xreuters_e2e_test_iran_2026_04_01",
  requestId: "0xreuters_e2e_req_iran_2026_04_01",
  sourceUrl: "https://www.reuters.com/",
  observedAt: "2026-04-01T13:13:39Z",
  contentType: "text/html",
  rawHash: "0xreuters_e2e_hash_placeholder",
  dataBrut: AVAILABLE ? readFileSync(REUTERS_HTML_PATH, "utf-8") : "",
};

// Skip gracefully if fixture not found (CI without the file)
const maybeDescribe = AVAILABLE ? describe : describe.skip;

// ─── Article extraction ───────────────────────────────────────────────────────

maybeDescribe("Reuters fixture – extractMainArticle", () => {
  it("extracts a non-empty headline", async () => {
    const result = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    expect(result.title).toBeTruthy();
    expect(result.title!.length).toBeGreaterThan(5);
  });

  it("extracts a byline", async () => {
    const result = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    expect(result.byline).toBeTruthy();
  });

  it("extracts a publication date (year from fixture meta)", async () => {
    const result = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    expect(result.publishedTime).toBeTruthy();
    const d = new Date(result.publishedTime!);
    expect(Number.isFinite(d.getTime())).toBe(true);
    expect(d.getUTCFullYear()).toBe(2026);
  });

  it("extracts at least 4 article paragraphs", async () => {
    const result = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    expect(result.paragraphs.length).toBeGreaterThanOrEqual(4);
  });

  it("paragraphs contain no invisible Unicode characters", async () => {
    const result = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const fullText = result.paragraphs.map((p) => p.text).join(" ");
    expect(fullText).not.toMatch(/[\u200B\u200C\u200D\u2060\uFEFF]/);
  });

  it("contains Iran-related article content", async () => {
    const result = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const fullText = result.paragraphs.map((p) => p.text).join(" ");
    expect(fullText.toLowerCase()).toContain("iran");
  });

  it("contains Trump-related content", async () => {
    const result = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const fullText = result.paragraphs.map((p) => p.text).join(" ");
    expect(fullText.toLowerCase()).toContain("trump");
  });

  it("does not include navigation/footer boilerplate", async () => {
    const result = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const fullText = result.paragraphs.map((p) => p.text).join(" ");
    expect(fullText).not.toContain("Privacy Policy");
    expect(fullText).not.toContain("Terms of Service");
  });
});

// ─── Clean article ────────────────────────────────────────────────────────────

maybeDescribe("Reuters fixture – buildCleanArticle", () => {
  it("produces a valid clean article JSON", async () => {
    const extracted = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const clean = buildCleanArticle(reutersCapture, extracted);

    expect(clean.schemaVersion).toBe("1.0");
    expect(clean.attestationId).toBe(reutersCapture.attestationId);
    expect(clean.sourceUrl).toBe(reutersCapture.sourceUrl);
  });

  it("clean article has title, publisher and publishedAt", async () => {
    const extracted = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const clean = buildCleanArticle(reutersCapture, extracted);

    expect(clean.title).toBeTruthy();
    expect(clean.title!.length).toBeGreaterThan(5);
    // publisher comes from og:site_name or siteName
    expect(clean.publisher).toBeTruthy();
    // publishedAt comes from article:published_time meta
    expect(clean.publishedAt).toBeTruthy();
    const pub = new Date(clean.publishedAt!);
    expect(Number.isFinite(pub.getTime())).toBe(true);
    expect(pub.getUTCFullYear()).toBe(2026);
  });

  it("paragraph charStart/charEnd correctly index fullText", async () => {
    const extracted = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const clean = buildCleanArticle(reutersCapture, extracted);

    for (const para of clean.paragraphs) {
      const slice = clean.fullText.slice(para.charStart, para.charEnd);
      expect(slice).toBe(para.text);
    }
  });

  it("paragraphs are ordered sequentially", async () => {
    const extracted = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const clean = buildCleanArticle(reutersCapture, extracted);

    clean.paragraphs.forEach((para, idx) => {
      expect(para.order).toBe(idx + 1);
    });
  });

  it("fullText equals paragraphs joined by \\n\\n", async () => {
    const extracted = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const clean = buildCleanArticle(reutersCapture, extracted);
    const expected = clean.paragraphs.map((p) => p.text).join("\n\n");
    expect(clean.fullText).toBe(expected);
  });

  it("paragraph IDs are deterministic (stable across runs)", async () => {
    const e1 = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const e2 = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const c1 = buildCleanArticle(reutersCapture, e1);
    const c2 = buildCleanArticle(reutersCapture, e2);
    expect(c1.paragraphs.map((p) => p.paragraphId)).toEqual(
      c2.paragraphs.map((p) => p.paragraphId)
    );
  });
});

// ─── Statement extraction ─────────────────────────────────────────────────────

maybeDescribe("Reuters fixture – statement extraction", () => {
  it("extracts at least one verifiable statement", async () => {
    const extracted = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const clean = buildCleanArticle(reutersCapture, extracted);

    const rawStmts = await extractStatements(clean.paragraphs, reutersCapture.attestationId, {
      useLlmFallback: false,
    });
    const paragraphMap = buildParagraphMap(clean.paragraphs);
    const validated = validateStatements(rawStmts, paragraphMap);

    expect(validated.length).toBeGreaterThanOrEqual(1);
  });

  it("every validated statement has non-empty content", async () => {
    const extracted = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const clean = buildCleanArticle(reutersCapture, extracted);
    const rawStmts = await extractStatements(clean.paragraphs, reutersCapture.attestationId, {
      useLlmFallback: false,
    });
    const paragraphMap = buildParagraphMap(clean.paragraphs);
    const validated = validateStatements(rawStmts, paragraphMap);

    for (const stmt of validated) {
      expect(stmt.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("all validated statements have auto_accepted status", async () => {
    const extracted = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const clean = buildCleanArticle(reutersCapture, extracted);
    const rawStmts = await extractStatements(clean.paragraphs, reutersCapture.attestationId, {
      useLlmFallback: false,
    });
    const paragraphMap = buildParagraphMap(clean.paragraphs);
    const validated = validateStatements(rawStmts, paragraphMap);

    for (const stmt of validated) {
      expect(stmt.validation.status).toBe("auto_accepted");
    }
  });

  it("statement content is an exact substring of its source paragraph", async () => {
    const extracted = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const clean = buildCleanArticle(reutersCapture, extracted);
    const rawStmts = await extractStatements(clean.paragraphs, reutersCapture.attestationId, {
      useLlmFallback: false,
    });
    const paragraphMap = buildParagraphMap(clean.paragraphs);
    const validated = validateStatements(rawStmts, paragraphMap);

    for (const stmt of validated) {
      const para = clean.paragraphs.find((p) => p.paragraphId === stmt.sourceParagraphId);
      expect(para).toBeDefined();
      expect(para!.text).toContain(stmt.content);
    }
  });
});

// ─── Verified refined statements ─────────────────────────────────────────────

maybeDescribe("Reuters fixture – deterministicStatementsToRefined", () => {
  it("converts deterministic statements to VerifiedRefinedStatement[]", async () => {
    const extracted = await extractMainArticle(reutersCapture.dataBrut, reutersCapture.sourceUrl);
    const clean = buildCleanArticle(reutersCapture, extracted);
    const rawStmts = await extractStatements(clean.paragraphs, reutersCapture.attestationId, {
      useLlmFallback: false,
    });
    const paragraphMap = buildParagraphMap(clean.paragraphs);
    const validated = validateStatements(rawStmts, paragraphMap);
    const refined = deterministicStatementsToRefined(validated);

    expect(refined.length).toBe(validated.length);
    for (const r of refined) {
      expect(r.verified).toBe(true);
      expect(r.verification_method).toBe("exact_match");
      expect(r.extracted_by).toBe("deterministic");
      expect(r.matched_spans.length).toBeGreaterThan(0);
      expect(r.statement_text.length).toBeGreaterThan(0);
    }
  });
});

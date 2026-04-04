/**
 * Unit tests for utility modules:
 *  - ids.ts
 *  - speakerNormalization.ts
 *  - offsets.ts
 */

import { describe, it, expect } from "@jest/globals";
import { paragraphId, statementId, chunkId, contentHash } from "../utils/ids.js";
import { normalizeSpeaker } from "../utils/speakerNormalization.js";
import {
  findExactSpan,
  verifySpan,
  extractContextWindow,
  computeParagraphOffsets,
} from "../utils/offsets.js";

// ─── ID generation ───────────────────────────────────────────────────────────

describe("ids – deterministic generation", () => {
  const attId = "0xabc123";

  it("paragraphId is stable for same inputs", () => {
    const id1 = paragraphId(attId, 1);
    const id2 = paragraphId(attId, 1);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^para_[0-9a-f]+$/);
  });

  it("paragraphId is different for different orders", () => {
    expect(paragraphId(attId, 1)).not.toBe(paragraphId(attId, 2));
  });

  it("statementId is stable", () => {
    const sid1 = statementId(attId, "para_abc", 10, 50);
    const sid2 = statementId(attId, "para_abc", 10, 50);
    expect(sid1).toBe(sid2);
    expect(sid1).toMatch(/^stmt_[0-9a-f]+$/);
  });

  it("statementId differs when span changes", () => {
    const a = statementId(attId, "para_abc", 10, 50);
    const b = statementId(attId, "para_abc", 10, 51);
    expect(a).not.toBe(b);
  });

  it("chunkId encodes type in prefix", () => {
    const sid = chunkId(attId, "statement", "stmt_001");
    const pid = chunkId(attId, "paragraph", "para_001");
    expect(sid).toMatch(/^chunk_s_/);
    expect(pid).toMatch(/^chunk_p_/);
  });

  it("contentHash returns 0x-prefixed hex", () => {
    const h = contentHash("hello world");
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

// ─── Speaker normalization ────────────────────────────────────────────────────

describe("speakerNormalization", () => {
  it("lowercases and replaces spaces with underscores", () => {
    expect(normalizeSpeaker("John Smith")).toBe("john_smith");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeSpeaker("  Donald   Trump  ")).toBe("donald_trump");
  });

  it("applies alias map", () => {
    expect(normalizeSpeaker("Trump")).toBe("donald_trump");
    expect(normalizeSpeaker("Biden")).toBe("joe_biden");
  });

  it("removes punctuation", () => {
    expect(normalizeSpeaker("Sen. Elizabeth Warren")).toBe("sen_elizabeth_warren");
  });

  it("handles empty/null-like input", () => {
    expect(normalizeSpeaker("")).toBe("unknown");
    expect(normalizeSpeaker("   ")).toBe("unknown");
  });

  it("is stable (deterministic)", () => {
    const n1 = normalizeSpeaker("Donald Trump");
    const n2 = normalizeSpeaker("Donald Trump");
    expect(n1).toBe(n2);
  });

  it("is case-insensitive for alias lookup", () => {
    expect(normalizeSpeaker("trump")).toBe("donald_trump");
    expect(normalizeSpeaker("TRUMP")).toBe("donald_trump");
  });
});

// ─── Offsets ─────────────────────────────────────────────────────────────────

describe("offsets", () => {
  const source = "President Trump said the United States was ready. He added more details.";

  it("findExactSpan finds needle at correct position", () => {
    const span = findExactSpan(source, "the United States");
    expect(span).not.toBeNull();
    const [start, end] = span!;
    expect(source.slice(start, end)).toBe("the United States");
  });

  it("findExactSpan returns null for missing needle", () => {
    expect(findExactSpan(source, "France")).toBeNull();
  });

  it("verifySpan validates a correct span", () => {
    const span = findExactSpan(source, "the United States")!;
    expect(verifySpan(source, span[0], span[1], "the United States")).toBe(true);
  });

  it("verifySpan rejects wrong content at span", () => {
    expect(verifySpan(source, 0, 5, "wrong")).toBe(false);
  });

  it("extractContextWindow returns surrounding text", () => {
    const span = findExactSpan(source, "the United States")!;
    const ctx = extractContextWindow(source, span[0], span[1], 50);
    expect(ctx.precedingText).toContain("said");
    expect(ctx.followingText).toContain("ready");
  });

  it("computeParagraphOffsets produces non-overlapping spans joined by \\n\\n", () => {
    const paras = ["First paragraph.", "Second paragraph.", "Third."];
    const offsets = computeParagraphOffsets(paras);
    expect(offsets).toHaveLength(3);

    const fullText = paras.join("\n\n");
    offsets.forEach(([start, end], i) => {
      expect(fullText.slice(start, end)).toBe(paras[i]);
    });
  });
});

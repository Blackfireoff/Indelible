/**
 * Verification pass for LLM-refined statements.
 *
 * For each LlmRawStatement:
 *  1. Validate that all evidence_paragraph_ids exist in the article.
 *  2. Try exact substring match in the evidence paragraphs.
 *  3. If that fails, try normalized match (strip invisible chars + collapse whitespace).
 *  4. Produce a VerifiedRefinedStatement with:
 *     - verified: true / false
 *     - verification_method: "exact_match" | "normalized_match" | "unverified"
 *     - matched_spans: [{paragraphId, charStart, charEnd, matchedText}]
 *     - extracted_by: "llm_refinement"
 *     - statementId: deterministic hash
 */

import type { CleanArticle, ArticleParagraph } from "../schemas/cleanArticle.js";
import type {
  LlmRawStatement,
  VerifiedRefinedStatement,
  MatchedSpan,
  VerificationMethod,
} from "../schemas/refinedStatements.js";
import { findExactSpan, findNormalizedSpan } from "../utils/offsets.js";
import { statementId } from "../utils/ids.js";

export interface VerificationOptions {
  /** Keep unverified statements in the output (default: true) */
  keepUnverified?: boolean;
  /** Minimum confidence threshold for unverified statements to keep (default: 0) */
  minUnverifiedConfidence?: number;
}

/**
 * Verify a batch of LLM-extracted statements against the clean article.
 * Returns VerifiedRefinedStatement[] sorted by paragraph order then confidence.
 */
export function verifyRefinedStatements(
  rawStatements: LlmRawStatement[],
  article: CleanArticle,
  opts: VerificationOptions = {}
): VerifiedRefinedStatement[] {
  const { keepUnverified = true, minUnverifiedConfidence = 0 } = opts;

  const paragraphMap = new Map<string, ArticleParagraph>(
    article.paragraphs.map((p) => [p.paragraphId, p])
  );

  const results: VerifiedRefinedStatement[] = [];

  for (const raw of rawStatements) {
    const verified = verifySingleStatement(raw, paragraphMap, article.attestationId);

    if (!verified.verified && !keepUnverified) continue;
    if (!verified.verified && verified.confidence < minUnverifiedConfidence) continue;

    results.push(verified);
  }

  // Sort: verified first, then by confidence descending
  results.sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return b.confidence - a.confidence;
  });

  return results;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function verifySingleStatement(
  raw: LlmRawStatement,
  paragraphMap: Map<string, ArticleParagraph>,
  attestationId: string
): VerifiedRefinedStatement {
  const candidateParagraphs = getCandidateParagraphs(raw, paragraphMap);

  // 1. Exact match
  for (const para of candidateParagraphs) {
    const span = findExactSpan(para.text, raw.statement_text);
    if (span) {
      const [charStart, charEnd] = span;
      return buildVerified(raw, para, charStart, charEnd, raw.statement_text, "exact_match", attestationId);
    }
  }

  // 2. Normalized match
  for (const para of candidateParagraphs) {
    const span = findNormalizedSpan(para.text, raw.statement_text);
    if (span) {
      const [charStart, charEnd] = span;
      const matchedText = para.text.slice(charStart, charEnd);
      return buildVerified(raw, para, charStart, charEnd, matchedText, "normalized_match", attestationId);
    }
  }

  // 3. Fallback: try all paragraphs if evidence_paragraph_ids were wrong/missing
  for (const para of paragraphMap.values()) {
    const span = findExactSpan(para.text, raw.statement_text);
    if (span) {
      const [charStart, charEnd] = span;
      return buildVerified(raw, para, charStart, charEnd, raw.statement_text, "exact_match", attestationId);
    }
    const normSpan = findNormalizedSpan(para.text, raw.statement_text);
    if (normSpan) {
      const [charStart, charEnd] = normSpan;
      const matchedText = para.text.slice(charStart, charEnd);
      return buildVerified(raw, para, charStart, charEnd, matchedText, "normalized_match", attestationId);
    }
  }

  // 4. Unverified
  return buildUnverified(raw, attestationId);
}

function getCandidateParagraphs(
  raw: LlmRawStatement,
  paragraphMap: Map<string, ArticleParagraph>
): ArticleParagraph[] {
  if (!raw.evidence_paragraph_ids || raw.evidence_paragraph_ids.length === 0) {
    return Array.from(paragraphMap.values());
  }
  const candidates: ArticleParagraph[] = [];
  for (const id of raw.evidence_paragraph_ids) {
    const para = paragraphMap.get(id);
    if (para) candidates.push(para);
  }
  // If none of the IDs resolved, fall back to all paragraphs
  return candidates.length > 0 ? candidates : Array.from(paragraphMap.values());
}

function buildVerified(
  raw: LlmRawStatement,
  para: ArticleParagraph,
  charStart: number,
  charEnd: number,
  matchedText: string,
  method: "exact_match" | "normalized_match",
  attestationId: string
): VerifiedRefinedStatement {
  const span: MatchedSpan = {
    paragraphId: para.paragraphId,
    charStart,
    charEnd,
    matchedText,
  };

  const sid = statementId(attestationId, para.paragraphId, charStart, charEnd);

  return {
    ...raw,
    // Ensure evidence_paragraph_ids includes the actual matched paragraph
    evidence_paragraph_ids: raw.evidence_paragraph_ids.includes(para.paragraphId)
      ? raw.evidence_paragraph_ids
      : [para.paragraphId, ...raw.evidence_paragraph_ids],
    statementId: sid,
    verified: true,
    verification_method: method,
    matched_spans: [span],
    extracted_by: "llm_refinement",
    // Boost confidence slightly for verified statements
    confidence: Math.min(1, raw.confidence + (method === "exact_match" ? 0.1 : 0.05)),
  };
}

function buildUnverified(
  raw: LlmRawStatement,
  attestationId: string
): VerifiedRefinedStatement {
  const pseudoId = `unverified_${attestationId}_${raw.statement_text.slice(0, 20).replace(/\s+/g, "_")}`;

  return {
    ...raw,
    statementId: pseudoId,
    verified: false,
    verification_method: "unverified" as VerificationMethod,
    matched_spans: [],
    extracted_by: "llm_refinement",
    confidence: Math.min(raw.confidence, 0.3),
  };
}

// ─── Also export a helper to convert from existing Statement[] ────────────────

import type { Statement } from "../schemas/statements.js";

/**
 * Convert the existing deterministic Statement[] format into VerifiedRefinedStatement[].
 * These are always considered "verified" since they passed the deterministic validation.
 */
export function deterministicStatementsToRefined(
  statements: Statement[],
  extractedBy: "deterministic" | "llm" = "deterministic",
): VerifiedRefinedStatement[] {
  return statements
    .filter((s) => s.validation.status !== "rejected")
    .map((s): VerifiedRefinedStatement => {
      const span: MatchedSpan = {
        paragraphId: s.sourceParagraphId,
        charStart: s.charStart,
        charEnd: s.charEnd,
        matchedText: s.content,
      };

      const statType: import("../schemas/refinedStatements.js").StatementType =
        s.quoteType === "direct" ? "direct_quote" : "reported_speech";

      return {
        statementId: s.statementId,
        speaker: s.speaker.name,
        speaker_role: s.speaker.role,
        statement_text: s.content,
        statement_type: statType,
        attribution_text: s.cue,
        evidence_paragraph_ids: [s.sourceParagraphId],
        confidence: s.confidence,
        verified: true,
        verification_method: "exact_match",
        matched_spans: [span],
        extracted_by: extractedBy,
      };
    });
}

import type { Statement, ValidationStatus } from "../schemas/statements.js";
import type { ArticleParagraph } from "../schemas/cleanArticle.js";
import { verifySpan } from "../utils/offsets.js";

/**
 * Post-extraction validation pass.
 *
 * For every statement:
 *  1. Verify that content is an exact substring of the source paragraph.
 *  2. Verify that charStart/charEnd match the content.
 *  3. Flag or reject statements that fail verification.
 *
 * Returns a new array of validated statements (no mutation of input).
 */
export function validateStatements(
  statements: Statement[],
  paragraphsById: Map<string, ArticleParagraph>
): Statement[] {
  return statements
    .map((stmt): Statement => {
      const para = paragraphsById.get(stmt.sourceParagraphId);

      if (!para) {
        return reject(stmt, "source paragraph not found");
      }

      const paragraphText = para.text;

      // Rule 1: content must be a non-empty substring
      if (!stmt.content || stmt.content.trim().length === 0) {
        return reject(stmt, "empty content");
      }

      // Rule 2: content must appear verbatim in paragraph text.
      // Statements that cannot be verified as exact substrings are rejected,
      // not just flagged – provenance fidelity is non-negotiable.
      if (!paragraphText.includes(stmt.content)) {
        return reject(stmt, "content not found as exact substring in paragraph");
      }

      // Rule 3: character span must match content
      if (stmt.charStart >= 0 && stmt.charEnd > stmt.charStart) {
        const spanValid = verifySpan(
          paragraphText,
          stmt.charStart,
          stmt.charEnd,
          stmt.content
        );
        if (!spanValid) {
          // Span mismatch – recalculate from content position
          const idx = paragraphText.indexOf(stmt.content);
          if (idx !== -1) {
            return {
              ...stmt,
              charStart: idx,
              charEnd: idx + stmt.content.length,
              validation: {
                status: "needs_review" as ValidationStatus,
                reviewRequired: true,
              },
              confidence: Math.min(stmt.confidence, 0.7),
            };
          }
          return needsReview(stmt, "span does not match content");
        }
      }

      return stmt;
    })
    .filter((stmt) => stmt.validation.status !== "rejected");
}

function reject(stmt: Statement, reason: string): Statement {
  console.warn(
    `[validateStatements] Rejecting statement ${stmt.statementId}: ${reason}`
  );
  return {
    ...stmt,
    validation: { status: "rejected", reviewRequired: false },
    confidence: 0,
  };
}

function needsReview(stmt: Statement, reason: string): Statement {
  console.warn(
    `[validateStatements] Flagging statement ${stmt.statementId} for review: ${reason}`
  );
  return {
    ...stmt,
    validation: { status: "needs_review", reviewRequired: true },
    confidence: Math.min(stmt.confidence, 0.5),
  };
}

/**
 * Build a lookup map from paragraphId → ArticleParagraph.
 */
export function buildParagraphMap(
  paragraphs: ArticleParagraph[]
): Map<string, ArticleParagraph> {
  return new Map(paragraphs.map((p) => [p.paragraphId, p]));
}

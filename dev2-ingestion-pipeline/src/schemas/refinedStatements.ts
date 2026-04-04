/**
 * Schema for LLM-refined statements.
 *
 * Flow:
 *  1. LLM receives clean article JSON → outputs LlmRawStatement[]
 *  2. Verification pass → VerifiedRefinedStatement[]
 *  3. All final statements stored in RefinedStatementsArtifact
 */

/** Statement type taxonomy */
export type StatementType =
  | "direct_quote"
  | "reported_speech"
  | "claim"
  | "denial"
  | "threat"
  | "promise"
  | "background";

/** How a statement was grounded back to the source text */
export type VerificationMethod =
  | "exact_match"       // statement_text found verbatim in paragraph
  | "normalized_match"  // found after stripping invisible chars + collapsing whitespace
  | "unverified";       // could not be grounded – kept with verified=false

/** Where in the source a matched span was found */
export interface MatchedSpan {
  paragraphId: string;
  charStart: number;
  charEnd: number;
  matchedText: string;
}

/** Raw output from the LLM (before verification) */
export interface LlmRawStatement {
  speaker: string | null;
  speaker_role: string | null;
  statement_text: string;
  statement_type: StatementType;
  attribution_text: string | null;
  evidence_paragraph_ids: string[];
  confidence: number;
}

/** LLM output after span verification */
export interface VerifiedRefinedStatement extends LlmRawStatement {
  statementId: string;
  verified: boolean;
  verification_method: VerificationMethod;
  matched_spans: MatchedSpan[];
  extracted_by: "deterministic" | "llm_refinement";
}

export interface RefinedStatementsArtifact {
  schemaVersion: "1.0";
  attestationId: string;
  requestId: string;
  sourceUrl: string;
  llm_used: boolean;
  llm_model: string | null;
  statements: VerifiedRefinedStatement[];
  extraction_summary: {
    total: number;
    verified: number;
    unverified: number;
  };
}

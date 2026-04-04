export type QuoteType = "direct" | "indirect" | "unattributed";
export type ValidationStatus = "auto_accepted" | "needs_review" | "rejected";

export interface Speaker {
  name: string;
  role: string | null;
  normalizedId: string;
}

export interface ContextWindow {
  precedingText: string;
  followingText: string;
}

export interface StatementValidation {
  status: ValidationStatus;
  reviewRequired: boolean;
}

export interface Statement {
  statementId: string;
  speaker: Speaker;
  quoteType: QuoteType;
  content: string;
  cue: string | null;
  sourceParagraphId: string;
  charStart: number;
  charEnd: number;
  contextWindow: ContextWindow;
  confidence: number;
  validation: StatementValidation;
}

export interface ExtractionPolicy {
  allowParaphrases: false;
  preserveExactText: true;
  speakerAttributionRequired: true;
}

export interface StatementsArtifact {
  schemaVersion: "1.0";
  attestationId: string;
  requestId: string;
  sourceUrl: string;
  extractionPolicy: ExtractionPolicy;
  statements: Statement[];
}

/**
 * Verify-claim mode output schema.
 */

export type Verdict = "supported" | "contradicted" | "partially_supported" | "unverifiable";

export interface VerdictCitation {
  chunkId: string;
  quote: string;
  sourceUrl: string;
  observedAt: string;
  storagePointer: string;
  attestationId: string;
  txHash?: string;
  chainId?: number;
}

export interface VerifyClaimOutput {
  mode: "verify-claim";
  verdict: Verdict;
  confidence: number; // 0.0 - 1.0
  explanation: string;
  supportingCitations: VerdictCitation[];
  contradictingCitations: VerdictCitation[];
  nuances: string[];
  meta: {
    query: string;
    speakerQuery: string;
    claimText: string;
    timeframe: string | null;
    chunksRetrieved: number;
    retrievalScoreAvg: number;
    documentsUsed: string[];
    model: string;
    timestamp: string;
  };
}

export function createUnverifiableOutput(
  query: string,
  speakerQuery: string,
  claimText: string
): VerifyClaimOutput {
  return {
    mode: "verify-claim",
    verdict: "unverifiable",
    confidence: 0.0,
    explanation: "No relevant chunks found in 0G Storage to verify this claim.",
    supportingCitations: [],
    contradictingCitations: [],
    nuances: [],
    meta: {
      query,
      speakerQuery,
      claimText,
      timeframe: null,
      chunksRetrieved: 0,
      retrievalScoreAvg: 0.0,
      documentsUsed: [],
      model: "unknown",
      timestamp: new Date().toISOString(),
    },
  };
}

export function validateVerifyClaimOutput(output: unknown): output is VerifyClaimOutput {
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;

  if (o.mode !== "verify-claim") return false;
  const validVerdicts = ["supported", "contradicted", "partially_supported", "unverifiable"];
  if (!validVerdicts.includes(o.verdict as string)) return false;
  if (typeof o.confidence !== "number" || o.confidence < 0 || o.confidence > 1) return false;
  if (typeof o.explanation !== "string") return false;
  if (!Array.isArray(o.supportingCitations)) return false;
  if (!Array.isArray(o.contradictingCitations)) return false;
  if (!Array.isArray(o.nuances)) return false;
  if (!o.meta || typeof o.meta !== "object") return false;

  const meta = o.meta as Record<string, unknown>;
  if (typeof meta.query !== "string") return false;
  if (typeof meta.speakerQuery !== "string") return false;
  if (typeof meta.claimText !== "string") return false;

  return true;
}

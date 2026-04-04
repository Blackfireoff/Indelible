/**
 * Verify Claim Pipeline
 *
 * Verifies whether a specific claim was made by a speaker.
 * Returns a verdict with supporting/contradicting citations.
 */

import type {
  VerifyClaimOutput,
  VerdictCitation,
} from "../../schemas/verify-claim-output";
import { createUnverifiableOutput } from "../../schemas/verify-claim-output";
import type { RetrievedChunk } from "../storage/types";
import {
  buildVerifyClaimSystemPrompt,
  buildVerifyClaimUserPrompt,
} from "../prompts";
import type { DocumentManifest } from "../storage/types";

export interface VerifyClaimInput {
  query: string;
  speaker: string;
  claim: string;
  chunks: RetrievedChunk[];
  documents: DocumentManifest[];
  retrievalScoreAvg: number;
  timeframe: string | null;
  model: string;
}

export interface VerifyClaimResult {
  output: VerifyClaimOutput;
  retrievalPassed: boolean;
}

/**
 * Run the verify-claim pipeline.
 */
export async function runVerifyClaimPipeline(
  input: VerifyClaimInput,
  llmCall: (
    systemPrompt: string,
    userPrompt: string
  ) => Promise<VerifyClaimOutput>
): Promise<VerifyClaimResult> {
  const { query, speaker, claim, chunks, documents, retrievalScoreAvg, timeframe, model } =
    input;

  if (chunks.length === 0) {
    return {
      output: createUnverifiableOutput(query, speaker, claim),
      retrievalPassed: false,
    };
  }

  // Build prompts
  const systemPrompt = buildVerifyClaimSystemPrompt();
  const userPrompt = buildVerifyClaimUserPrompt(
    query,
    speaker,
    claim,
    chunks,
    timeframe
  );

  // Call LLM
  let output = await llmCall(systemPrompt, userPrompt);

  // Validate output has required fields
  if (!output || !output.verdict) {
    output = createUnverifiableOutput(query, speaker, claim);
  }

  // Ensure meta is complete
  output.meta = {
    query,
    speakerQuery: speaker,
    claimText: claim,
    timeframe,
    chunksRetrieved: chunks.length,
    retrievalScoreAvg,
    documentsUsed: [...new Set(documents.map((d) => d.documentId))],
    model,
    timestamp: new Date().toISOString(),
  };

  // If no citations but claim is not unverifiable, force unverifiable
  if (
    output.verdict !== "unverifiable" &&
    output.supportingCitations.length === 0 &&
    output.contradictingCitations.length === 0
  ) {
    output.verdict = "unverifiable";
    output.explanation =
      "No relevant citations found in retrieved chunks to support or refute this claim.";
    output.confidence = 0.0;
  }

  return {
    output,
    retrievalPassed: true,
  };
}

/**
 * Convert a RetrievedChunk to a VerdictCitation for inclusion in output.
 */
export function chunkToVerdictCitation(chunk: RetrievedChunk): VerdictCitation {
  return {
    chunkId: chunk.chunkId,
    quote: chunk.text.slice(0, 200) + (chunk.text.length > 200 ? "..." : ""),
    sourceUrl: chunk.sourceUrl,
    observedAt: chunk.observedAt,
    storagePointer: chunk.storagePointer,
    attestationId: "", // Would be populated from document manifest
  };
}

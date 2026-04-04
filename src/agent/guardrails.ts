/**
 * Guardrails for the RAG agent.
 * Enforces citation requirements and handles insufficient evidence.
 */

import type { AgentOutput } from "../../schemas/agent-output";
import { createEmptyOutput } from "../../schemas/agent-output";
import type { RetrievedChunk } from "../storage/types";

export interface GuardrailResult {
  allowed: boolean;
  output: AgentOutput;
  reason?: string;
}

const MIN_CHUNKS = 1;
const MIN_AVG_SCORE = 0.1;
const RETRY_LIMIT = 1;

/**
 * Check if retrieved chunks meet minimum quality thresholds.
 */
export function validateRetrieval(
  chunks: RetrievedChunk[],
  topK: number = 5
): GuardrailResult {
  if (chunks.length === 0) {
    return {
      allowed: false,
      output: { ...createEmptyOutput(), limitations: "No chunks retrieved from 0G Storage." },
      reason: "No chunks retrieved",
    };
  }

  if (chunks.length < MIN_CHUNKS) {
    return {
      allowed: false,
      output: {
        ...createEmptyOutput(),
        limitations: `Only ${chunks.length} chunk(s) retrieved, minimum ${MIN_CHUNKS} required.`,
      },
      reason: "Insufficient chunks",
    };
  }

  const avgScore = chunks.slice(0, topK).reduce((s, c) => s + c.score, 0) / Math.min(chunks.length, topK);
  if (avgScore < MIN_AVG_SCORE) {
    return {
      allowed: false,
      output: {
        ...createEmptyOutput(),
        limitations: `Average retrieval score ${avgScore.toFixed(3)} below threshold ${MIN_AVG_SCORE}.`,
      },
      reason: "Low retrieval confidence",
    };
  }

  return { allowed: true, output: createEmptyOutput() };
}

/**
 * Validate that LLM output has valid citations.
 */
export function validateCitations(output: AgentOutput): GuardrailResult {
  if (output.citations.length === 0) {
    return {
      allowed: false,
      output: { ...output, limitations: "No citations provided. Agent must cite evidence." },
      reason: "Missing citations",
    };
  }

  for (const citation of output.citations) {
    if (!citation.chunkId || !citation.storagePointer) {
      return {
        allowed: false,
        output: { ...output, limitations: "Citation missing chunkId or storagePointer." },
        reason: "Invalid citation format",
      };
    }
    if (!citation.storagePointer.startsWith("0g://")) {
      return {
        allowed: false,
        output: { ...output, limitations: "Citation storagePointer must be a 0G pointer." },
        reason: "Invalid storage pointer",
      };
    }
  }

  // Check that evidence array matches citations
  for (const chunkId of output.evidence) {
    const hasCitation = output.citations.some((c) => c.chunkId === chunkId);
    if (!hasCitation) {
      return {
        allowed: false,
        output: { ...output, limitations: `Evidence ${chunkId} has no corresponding citation.` },
        reason: "Evidence-citation mismatch",
      };
    }
  }

  return { allowed: true, output };
}

/**
 * Detect contradictions across retrieved chunks.
 */
export function detectContradictions(chunks: RetrievedChunk[]): string[] {
  const contradictions: string[] = [];
  const speakers = new Map<string, string[]>();

  for (const chunk of chunks) {
    if (chunk.speaker) {
      const existing = speakers.get(chunk.speaker) ?? [];
      speakers.set(chunk.speaker, [...existing, chunk.text]);
    }
  }

  // Simple contradiction detection: if same speaker has very different claims
  // This is a basic heuristic - proper contradiction detection needs NLP
  for (const [speaker, texts] of speakers) {
    if (texts.length > 1) {
      // Check for negation keywords (simplified)
      const negPatterns = ["not", "never", "no", "doesn't", "doesn't", "won't", "can't"];
      const hasNeg = texts.map((t) => negPatterns.some((p) => t.toLowerCase().includes(p)));
      if (hasNeg.some((n) => n) && hasNeg.some((n) => !n)) {
        contradictions.push(
          `Speaker "${speaker}" has conflicting statements across chunks.`
        );
      }
    }
  }

  return contradictions;
}

export { RETRY_LIMIT };

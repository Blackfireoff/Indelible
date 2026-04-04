/**
 * General Question Pipeline
 *
 * Handles open-ended questions with citations and contradiction detection.
 */

import type { AgentOutput } from "../../schemas/agent-output";
import { createEmptyOutput } from "../../schemas/agent-output";
import type { RetrievedChunk } from "../storage/types";
import {
  buildGeneralQuestionSystemPrompt,
  buildGeneralQuestionUserPrompt,
} from "../prompts";
import { detectContradictionsFromChunks } from "../analysis/contradictions";

export interface GeneralQuestionInput {
  query: string;
  chunks: RetrievedChunk[];
  model: string;
}

export interface GeneralQuestionResult {
  output: AgentOutput;
  retrievalPassed: boolean;
  contradictionsFound: boolean;
}

/**
 * Run the general question pipeline.
 */
export async function runGeneralQuestionPipeline(
  input: GeneralQuestionInput,
  llmCall: (systemPrompt: string, userPrompt: string) => Promise<AgentOutput>
): Promise<GeneralQuestionResult> {
  const { query, chunks, model } = input;

  if (chunks.length === 0) {
    return {
      output: {
        ...createEmptyOutput(),
        limitations: "No chunks retrieved from 0G Storage.",
      },
      retrievalPassed: false,
      contradictionsFound: false,
    };
  }

  // Detect contradictions first
  const contradictions = detectContradictionsFromChunks(chunks);

  // Build prompts
  const systemPrompt = buildGeneralQuestionSystemPrompt();
  const userPrompt = buildGeneralQuestionUserPrompt(query, chunks);

  // Call LLM
  const output = await llmCall(systemPrompt, userPrompt);

  // If contradictions found, append to limitations
  let limitations = output.limitations ?? "";
  if (contradictions.length > 0) {
    const descs = contradictions.map((c) => c.description);
    limitations = limitations
      ? limitations + " Contradictions detected: " + descs.join("; ")
      : "Contradictions detected: " + descs.join("; ");
  }

  return {
    output: { ...output, limitations },
    retrievalPassed: true,
    contradictionsFound: contradictions.length > 0,
  };
}

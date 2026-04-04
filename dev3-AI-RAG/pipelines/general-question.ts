/**
 * General Question Pipeline
 *
 * Handles open-ended questions with citations and contradiction detection.
 * Contradictions are detected by the LLM as part of the response.
 */

import type { AgentOutput } from "../../schemas/agent-output";
import { createEmptyOutput } from "../../schemas/agent-output";
import type { RetrievedChunk } from "../storage/types";
import {
  buildGeneralQuestionSystemPrompt,
  buildGeneralQuestionUserPrompt,
} from "../prompts";

export interface GeneralQuestionInput {
  query: string;
  chunks: RetrievedChunk[];
  model: string;
}

export interface GeneralQuestionResult {
  output: AgentOutput;
  retrievalPassed: boolean;
}

/**
 * Run the general question pipeline.
 * Contradiction detection is handled by the LLM via the system prompt.
 */
export async function runGeneralQuestionPipeline(
  input: GeneralQuestionInput,
  llmCall: (systemPrompt: string, userPrompt: string) => Promise<AgentOutput>
): Promise<GeneralQuestionResult> {
  const { query, chunks } = input;

  if (chunks.length === 0) {
    return {
      output: {
        ...createEmptyOutput(),
        limitations: "No chunks retrieved from 0G Storage.",
      },
      retrievalPassed: false,
    };
  }

  // Build prompts
  const systemPrompt = buildGeneralQuestionSystemPrompt();
  const userPrompt = buildGeneralQuestionUserPrompt(query, chunks);

  // Call LLM - it handles contradiction detection via the prompt
  const output = await llmCall(systemPrompt, userPrompt);

  return {
    output,
    retrievalPassed: true,
  };
}

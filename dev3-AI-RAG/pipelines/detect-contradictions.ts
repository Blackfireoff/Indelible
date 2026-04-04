/**
 * Detect Contradictions Pipeline
 *
 * Automatically finds contradictions within a speaker's statements on a topic.
 */

import type {
  DetectContradictionsOutput,
  Contradiction,
} from "../../schemas/detect-contradictions-output";
import {
  createNoContradictionsOutput,
} from "../../schemas/detect-contradictions-output";
import type { RetrievedChunk } from "../storage/types";
import {
  buildDetectContradictionsSystemPrompt,
  buildDetectContradictionsUserPrompt,
} from "../prompts";
import type { DocumentManifest } from "../storage/types";

export interface DetectContradictionsInput {
  query: string;
  speaker: string;
  topic: string | null;
  claim: string | null;
  chunks: RetrievedChunk[];
  documents: DocumentManifest[];
  timeframe: string | null;
  model: string;
}

export interface DetectContradictionsResult {
  output: DetectContradictionsOutput;
  retrievalPassed: boolean;
}

/**
 * Run the detect-contradictions pipeline.
 */
export async function runDetectContradictionsPipeline(
  input: DetectContradictionsInput,
  llmCall: (
    systemPrompt: string,
    userPrompt: string
  ) => Promise<DetectContradictionsOutput>
): Promise<DetectContradictionsResult> {
  const { query, speaker, topic, claim, chunks, documents, timeframe, model } = input;

  if (chunks.length === 0) {
    return {
      output: createNoContradictionsOutput(
        query,
        speaker,
        topic,
        0,
        documents.map((d) => d.documentId)
      ),
      retrievalPassed: false,
    };
  }

  // Build prompts
  const systemPrompt = buildDetectContradictionsSystemPrompt();
  const userPrompt = buildDetectContradictionsUserPrompt(
    query,
    speaker,
    topic,
    chunks,
    timeframe
  );

  // Call LLM
  let output = await llmCall(systemPrompt, userPrompt);

  // Validate output has required fields
  if (!output || !Array.isArray(output.contradictions)) {
    output = createNoContradictionsOutput(
      query,
      speaker,
      topic,
      chunks.length,
      [...new Set(documents.map((d) => d.documentId))]
    );
  }

  // Ensure meta is complete
  output.meta = {
    query,
    speakerQuery: speaker,
    topic,
    timeframe,
    chunksAnalyzed: chunks.length,
    documentsUsed: [...new Set(documents.map((d) => d.documentId))],
    model,
    timestamp: new Date().toISOString(),
  };

  // Ensure contradictions have IDs
  output.contradictions = output.contradictions.map((contr, idx) => ({
    ...contr,
    id: contr.id || `contradiction-${String(idx + 1).padStart(3, "0")}`,
  }));

  return {
    output,
    retrievalPassed: true,
  };
}

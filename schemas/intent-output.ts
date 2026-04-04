/**
 * Intent classification output schema.
 * Internal only - not sent to frontend.
 */

export type IntentMode = "general-question" | "verify-claim" | "detect-contradictions";

export interface ParsedIntent {
  speaker: string | null;
  claim: string | null;
  topic: string | null;
  timeframe: string | null;
}

export interface IntentOutput {
  mode: IntentMode;
  confidence: number; // 0.0 - 1.0
  parsed: ParsedIntent;
}

export function createEmptyIntent(): IntentOutput {
  return {
    mode: "general-question",
    confidence: 0.0,
    parsed: {
      speaker: null,
      claim: null,
      topic: null,
      timeframe: null,
    },
  };
}

export function validateIntentOutput(output: unknown): output is IntentOutput {
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;

  const validModes = ["general-question", "verify-claim", "detect-contradictions"];
  if (typeof o.mode !== "string" || !validModes.includes(o.mode)) return false;
  if (typeof o.confidence !== "number") return false;
  if (o.confidence < 0 || o.confidence > 1) return false;
  if (!o.parsed || typeof o.parsed !== "object") return false;

  const parsed = o.parsed as Record<string, unknown>;
  if (typeof parsed.speaker !== "string" && parsed.speaker !== null) return false;
  if (typeof parsed.claim !== "string" && parsed.claim !== null) return false;
  if (typeof parsed.topic !== "string" && parsed.topic !== null) return false;
  if (typeof parsed.timeframe !== "string" && parsed.timeframe !== null) return false;

  return true;
}

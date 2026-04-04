/**
 * Deterministic router for intent modes.
 *
 * Validates detected intent and corrects the mode if requirements are not met:
 * - verify-claim requires: speaker AND claim
 * - detect-contradictions requires: speaker AND (topic OR claim)
 * - Otherwise defaults to general-question
 */

import type { IntentOutput, IntentMode } from "../../schemas/intent-output";

export interface RouterResult {
  mode: IntentMode;
  corrected: boolean;
  reason: string;
}

export function routeIntent(intent: IntentOutput): RouterResult {
  const { mode, parsed } = intent;

  switch (mode) {
    case "verify-claim": {
      const hasSpeaker = parsed.speaker !== null && parsed.speaker.trim().length > 0;
      const hasClaim = parsed.claim !== null && parsed.claim.trim().length > 0;

      if (!hasSpeaker || !hasClaim) {
        return {
          mode: "general-question",
          corrected: true,
          reason: !hasSpeaker
            ? "verify-claim requires a speaker; falling back to general-question"
            : "verify-claim requires a claim; falling back to general-question",
        };
      }
      return { mode: "verify-claim", corrected: false, reason: "" };
    }

    case "detect-contradictions": {
      const hasSpeaker = parsed.speaker !== null && parsed.speaker.trim().length > 0;
      const hasTopic = parsed.topic !== null && parsed.topic.trim().length > 0;
      const hasClaim = parsed.claim !== null && parsed.claim.trim().length > 0;

      if (!hasSpeaker || (!hasTopic && !hasClaim)) {
        return {
          mode: "general-question",
          corrected: true,
          reason: !hasSpeaker
            ? "detect-contradictions requires a speaker; falling back to general-question"
            : "detect-contradictions requires a topic or claim; falling back to general-question",
        };
      }
      return { mode: "detect-contradictions", corrected: false, reason: "" };
    }

    case "general-question":
    default:
      return { mode: "general-question", corrected: false, reason: "" };
  }
}

/**
 * Extract and normalize speaker name from various query formats.
 */
export function normalizeSpeakerName(raw: string | null): string | null {
  if (!raw) return null;

  // Remove common prefixes/suffixes
  let normalized = raw
    .replace(/^(the\s+)/i, "")
    .replace(/\s+(administration|office)$/i, "")
    .trim();

  // Title case
  normalized = normalized
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return normalized;
}

/**
 * Check if a speaker matches (case-insensitive, partial match supported).
 */
export function speakerMatches(querySpeaker: string | null, chunkSpeaker: string | null): boolean {
  if (!querySpeaker || !chunkSpeaker) return false;
  const q = querySpeaker.toLowerCase().replace(/\s+/g, " ").trim();
  const c = chunkSpeaker.toLowerCase().replace(/\s+/g, " ").trim();
  return c.includes(q) || q.includes(c);
}

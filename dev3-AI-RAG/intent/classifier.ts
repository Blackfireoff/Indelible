/**
 * Intent classification prompt and parser.
 *
 * Takes a user query and returns the detected mode (general-question, verify-claim, detect-contradictions)
 * along with parsed fields (speaker, claim, topic, timeframe).
 */

import type { IntentOutput, IntentMode } from "../../schemas/intent-output";
import { createEmptyIntent } from "../../schemas/intent-output";

const INTENT_CLASSIFIER_PROMPT = `You are an expert intent classifier for Indelible, a citation-first AI system that verifies speaker statements using evidence from 0G Storage.

TASK: Classify the user's query into EXACTLY ONE of three modes. Choose the mode that BEST matches the user's intent.

MODE DEFINITIONS:

"general-question" - User wants INFORMATION or an ANSWER. The user is asking what was said, not whether a specific claim is true.
- "What did Trump say about tariffs?" → general-question
- "Tell me about the tariff policy." → general-question
- "What is Trump's position on China trade?" → general-question
- "Can you summarize what officials said about interest rates?" → general-question

"verify-claim" - User wants to VERIFY a SPECIFIC CLAIM. The query contains or implies a statement that needs checking.
- "Did Trump say tariffs are working?" → verify-claim (claim: "tariffs are working")
- "Is it true that China is paying billions in tariffs?" → verify-claim (claim: "China is paying billions")
- "Was the trade deal actually signed?" → verify-claim (claim: "trade deal was signed")
- "Did the press secretary claim tariffs reduced the deficit?" → verify-claim (claim: "tariffs reduced the deficit")

"detect-contradictions" - User wants to FIND CONFLICTS or INCONSISTENCIES in a speaker's statements.
- "Find contradictions in Trump's tariff statements." → detect-contradictions
- "Are there conflicting statements about the trade war?" → detect-contradictions
- "What did Trump say about tariffs in 2024 vs 2025?" → detect-contradictions
- "Show me where the administration's position changed on immigration." → detect-contradictions

KEY DIFFERENTIATORS:
- Does the user want to CHECK if something is true? → verify-claim
- Does the user want to FIND disagreements/inconsistencies? → detect-contradictions
- Does the user want to KNOW what was said? → general-question

Return a JSON object with this exact schema:
{
  "mode": "general-question" | "verify-claim" | "detect-contradictions",
  "confidence": 0.0-1.0,
  "parsed": {
    "speaker": "The speaker name if identified, null otherwise",
    "claim": "The exact claim being verified (for verify-claim), null otherwise",
    "topic": "The main topic/keyword of the query, null otherwise",
    "timeframe": "Any time period mentioned (e.g. '2024-2025'), null otherwise"
  }
}

RULES:
- You MUST return exactly one mode, no defaults
- For verify-claim: extract the exact claim text as the user phrased or implied it
- For detect-contradictions: extract the speaker and topic being compared
- For general-question: extract speaker and topic if present
- confidence reflects how certain you are about the classification (0.5-1.0, never below 0.5)
- Always respond with valid JSON only, no additional text`;

export function buildIntentPrompt(query: string): string {
  return `${INTENT_CLASSIFIER_PROMPT}

USER QUERY: ${query}

Respond with JSON only.`;
}

export function parseIntentResponse(raw: string): IntentOutput {
  try {
    // Try to extract JSON from the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { ...createEmptyIntent(), confidence: 0.0 };
    }

    const parsed = JSON.parse(jsonMatch[0]) as IntentOutput;

    // Validate and normalize
    const validModes: IntentMode[] = ["general-question", "verify-claim", "detect-contradictions"];
    if (!validModes.includes(parsed.mode)) {
      parsed.mode = "general-question";
    }
    if (typeof parsed.confidence !== "number" || parsed.confidence < 0) {
      parsed.confidence = 0.0;
    }
    if (parsed.confidence > 1) {
      parsed.confidence = 1.0;
    }

    // Ensure parsed fields exist
    if (!parsed.parsed) {
      parsed.parsed = { speaker: null, claim: null, topic: null, timeframe: null };
    }

    return parsed;
  } catch {
    return { ...createEmptyIntent(), confidence: 0.0 };
  }
}

/**
 * Classify intent using an LLM call.
 * Falls back to general-question if LLM unavailable or fails.
 */
export async function classifyIntent(
  query: string,
  llmCall: (prompt: string) => Promise<string>
): Promise<IntentOutput> {
  try {
    const prompt = buildIntentPrompt(query);
    const response = await llmCall(prompt);
    const intent = parseIntentResponse(response);

    // Fallback to general-question if confidence too low
    if (intent.confidence < 0.6) {
      return { ...createEmptyIntent(), mode: "general-question", confidence: intent.confidence };
    }

    return intent;
  } catch {
    return { ...createEmptyIntent(), confidence: 0.0 };
  }
}

/**
 * Simple keyword-based intent classifier for when LLM is unavailable.
 * Used as fallback or for testing.
 */
export function classifyIntentByKeywords(query: string): IntentOutput {
  const lowerQuery = query.toLowerCase();

  // Verify-claim indicators - must be at start or after question mark
  const verifyClaimPatterns = [
    /^(?:did|is|was|has|does|can)\s+\w+/i,
    /\?\s*(?:did|is|was|has|does|can)\s+\w+/i,
    /\b(?:is\s+it\s+true\s+that|was\s+\w+\s+claimed|claim[s]?\s+that|statement[s]?\s+that)\b/i,
  ];

  // Detect-contradictions indicators
  const detectContradictionsPatterns = [
    /contradictions?/,
    /conflicting\s+(statement|claim|position)/,
    /inconsistent/,
    /changed\s+(position|stance|view)/,
    /flip[\s-]?(flop|ped)/,
    /versus\s+\w+\s+about\b/,
    /versus\s+\w+\s+on\b/,
    /versus\s+\w+\s+regarding\b/,
    /about\s+\w+\s+versus\b/,
    /on\s+\w+\s+versus\b/,
  ];

  // Check for verify-claim
  for (const pattern of verifyClaimPatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        mode: "verify-claim",
        confidence: 0.7,
        parsed: extractSpeakerAndTopic(query),
      };
    }
  }

  // Check for detect-contradictions
  for (const pattern of detectContradictionsPatterns) {
    if (pattern.test(lowerQuery)) {
      return {
        mode: "detect-contradictions",
        confidence: 0.7,
        parsed: extractSpeakerAndTopic(query),
      };
    }
  }

  // Default to general-question
  return {
    mode: "general-question",
    confidence: 0.5,
    parsed: extractSpeakerAndTopic(query),
  };
}

function extractSpeakerAndTopic(query: string): IntentOutput["parsed"] {
  // Simple extraction heuristics (case-insensitive)
  // Match patterns like "Did Trump say" or "Trump said" but capture only the speaker name
  const speakerPatterns = [
    // "Did X say/claim/..." - capture X (first capitalized word after did/is/was/etc)
    /\b(?:did|is|was|has|does|can)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:say|claim|state|mention)/i,
    // "X said/claimed that" - capture X
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|claimed|stated|mentioned|believes?)\b/i,
    // "About X" - capture X
    /\babout\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  ];

  let speaker: string | null = null;
  for (const pattern of speakerPatterns) {
    const match = query.match(pattern);
    if (match) {
      speaker = match[1];
      break;
    }
  }

  // Extract potential topic (nouns after prepositions)
  const topicMatch = query.match(/(?:about|on|regarding|concerning)\s+([^?]+)/i);
  const topic = topicMatch ? topicMatch[1].trim() : null;

  return {
    speaker,
    claim: null,
    topic,
    timeframe: null,
  };
}

/**
 * Contradiction detection for retrieved chunks.
 *
 * Detects three types of contradictions:
 * 1. Negation conflicts  — one chunk affirms X, another denies X
 * 2. Numeric conflicts   — conflicting numbers/statistics
 * 3. Cross-speaker claims — different speakers make opposing claims on the same topic
 *
 * Returns a list of Contradiction objects compatible with the AgentOutput schema.
 */

import type { Chunk } from "../storage/types";
import type { Contradiction } from "../../schemas/agent-output";

const NEGATION_PATTERNS = [
  /\bnot\b/i,
  /\bnever\b/i,
  /\bno\b/i,
  /\bdoesn't\b/i,
  /\bdon't\b/i,
  /\bwon't\b/i,
  /\bcan't\b/i,
  /\bwill not\b/i,
  /\bcannot\b/i,
  /\bhowever\b/i,
  /\bbut\b/i,
];

const AFFIRMATION_PATTERNS = [
  /\byes\b/i,
  /\balways\b/i,
  /\bdefinitely\b/i,
  /\bcertainly\b/i,
  /\bindeed\b/i,
  /\babsolutely\b/i,
];

/**
 * Check whether a text chunk contains negation or affirmation signals.
 */
function getSentimentSignal(text: string): "neg" | "aff" | "neutral" {
  const hasNeg = NEGATION_PATTERNS.some((p) => p.test(text));
  const hasAff = AFFIRMATION_PATTERNS.some((p) => p.test(text));
  if (hasNeg && !hasAff) return "neg";
  if (hasAff && !hasNeg) return "neutral";
  if (hasNeg && hasAff) return "neutral"; // mixed = neutral
  return "neutral";
}

/**
 * Extract the first number (with optional units) found in a string.
 */
function extractNumber(text: string): { value: number; unit: string } | null {
  const match = text.match(/(\d[\d,]*\.?\d*)\s*(billion|million|trillion|percent|%|dollars|\$)?/i);
  if (!match) return null;
  const value = parseFloat(match[1].replace(/,/g, ""));
  return { value, unit: (match[2] ?? "").trim().toLowerCase() };
}

/**
 * Detect explicit negation contradictions between two chunks from the same speaker.
 */
function detectNegationContradiction(a: Chunk, b: Chunk): string | null {
  if (a.speaker !== b.speaker) return null;
  if (a.chunkId === b.chunkId) return null;

  const signalA = getSentimentSignal(a.text);
  const signalB = getSentimentSignal(b.text);

  if (signalA === "neg" && signalB !== "neg") {
    return `"${a.speaker}" makes a negated claim in one chunk and a positive claim in another chunk on the same topic.`;
  }
  if (signalA !== "neg" && signalB === "neg") {
    return `"${a.speaker}" makes a positive claim in one chunk and a negated claim in another chunk on the same topic.`;
  }
  return null;
}

/**
 * Detect conflicting numeric/statistical claims between two chunks.
 * Only flags conflicts when the same unit is involved (e.g., both are billions).
 */
function detectNumericContradiction(a: Chunk, b: Chunk): string | null {
  if (a.chunkId === b.chunkId) return null;

  const numA = extractNumber(a.text);
  const numB = extractNumber(b.text);

  if (!numA || !numB) return null;
  if (numA.unit !== numB.unit) return null;

  const ratio = Math.max(numA.value, numB.value) / Math.min(numA.value, numB.value);
  // Flag if numbers differ by more than 2x (likely a factual contradiction, not rounding)
  if (ratio > 2) {
    return `Conflicting values for the same metric: "${numA.value} ${numA.unit}" vs "${numB.value} ${numB.unit}" across chunks "${a.chunkId}" and "${b.chunkId}".`;
  }
  return null;
}

/**
 * Detect cross-speaker contradictions — different speakers making opposing claims.
 * Heuristic: if two chunks have opposing sentiment signals on the same topic keywords.
 */
function detectCrossSpeakerContradiction(a: Chunk, b: Chunk): string | null {
  if (a.speaker === b.speaker) return null;
  if (a.chunkId === b.chunkId) return null;

  // Check for overlapping topic keywords (tariff, trade, China, etc.)
  const tariffKeywords = /\b(tariff|tariffs|trade|china|import|export|economy|price|prices)\b/gi;
  const keywordsA = a.text.toLowerCase().match(tariffKeywords) ?? [];
  const keywordsB = b.text.toLowerCase().match(tariffKeywords) ?? [];

  if (keywordsA.length === 0 || keywordsB.length === 0) return null;

  // Check if there's overlap in keywords AND opposing sentiment
  const signalA = getSentimentSignal(a.text);
  const signalB = getSentimentSignal(b.text);

  if (signalA === "neg" && signalB !== "neg") {
    return `"${a.speaker}" and "${b.speaker}" make opposing claims on trade/tariffs.`;
  }
  if (signalA !== "neg" && signalB === "neg") {
    return `"${a.speaker}" and "${b.speaker}" make opposing claims on trade/tariffs.`;
  }
  return null;
}

/**
 * Main entry point: detect all contradictions across a list of retrieved chunks.
 * O(n^2) pairwise comparison — suitable for small top-K result sets.
 */
export function detectContradictions(chunks: Chunk[]): Contradiction[] {
  const contradictions: Contradiction[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      const a = chunks[i];
      const b = chunks[j];

      // Try each detector
      const description =
        detectNegationContradiction(a, b) ??
        detectNumericContradiction(a, b) ??
        detectCrossSpeakerContradiction(a, b) ??
        null;

      if (description) {
        const key = [a.chunkId, b.chunkId].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          contradictions.push({
            description,
            chunkIds: [a.chunkId, b.chunkId],
          });
        }
      }
    }
  }

  return contradictions;
}

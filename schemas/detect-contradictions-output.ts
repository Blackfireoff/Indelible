/**
 * Detect-contradictions mode output schema.
 */

export type ContradictionSeverity = "high" | "medium" | "low";

export interface Contradiction {
  id: string;
  description: string;
  topic: string;
  chunkIds: string[];
  quotes: string[];
  severity: ContradictionSeverity;
  timestamps: string[];
}

export interface DetectContradictionsOutput {
  mode: "detect-contradictions";
  contradictions: Contradiction[];
  summary: string;
  meta: {
    query: string;
    speakerQuery: string;
    topic: string | null;
    timeframe: string | null;
    chunksAnalyzed: number;
    documentsUsed: string[];
    model: string;
    timestamp: string;
  };
}

export function createNoContradictionsOutput(
  query: string,
  speakerQuery: string,
  topic: string | null,
  chunksAnalyzed: number,
  documentsUsed: string[]
): DetectContradictionsOutput {
  return {
    mode: "detect-contradictions",
    contradictions: [],
    summary: "No contradictions detected in the available evidence for the specified speaker and topic.",
    meta: {
      query,
      speakerQuery,
      topic,
      timeframe: null,
      chunksAnalyzed,
      documentsUsed,
      model: "unknown",
      timestamp: new Date().toISOString(),
    },
  };
}

export function validateDetectContradictionsOutput(output: unknown): output is DetectContradictionsOutput {
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;

  if (o.mode !== "detect-contradictions") return false;
  if (!Array.isArray(o.contradictions)) return false;
  if (typeof o.summary !== "string") return false;
  if (!o.meta || typeof o.meta !== "object") return false;

  const meta = o.meta as Record<string, unknown>;
  if (typeof meta.query !== "string") return false;
  if (typeof meta.speakerQuery !== "string") return false;

  for (const contr of o.contradictions as unknown[]) {
    if (typeof contr !== "object" || contr === null) return false;
    const c = contr as Record<string, unknown>;
    if (typeof c.id !== "string") return false;
    if (typeof c.description !== "string") return false;
    if (typeof c.topic !== "string") return false;
    if (!Array.isArray(c.chunkIds)) return false;
    if (!Array.isArray(c.quotes)) return false;
    const validSeverities = ["high", "medium", "low"];
    if (!validSeverities.includes(c.severity as string)) return false;
    if (!Array.isArray(c.timestamps)) return false;
  }

  return true;
}

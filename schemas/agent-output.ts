/**
 * Agent output schema for Indelible RAG pipeline.
 * Every answer must be traceable to 0G artifacts via citations.
 */

export interface Citation {
  chunkId: string;
  attestationId: string; // Used to fetch the clean article from 0G
  quote: string;
  sourceUrl: string;
  observedAt: string;
  storagePointer: string;
}

export interface Contradiction {
  description: string;
  chunkIds: string[];
}

export interface AgentOutput {
  answer: string;
  citations: Citation[];
  confidence: number; // 0.0 - 1.0
  evidence: string[]; // chunkIds used
  limitations: string;
  contradictions: Contradiction[];
}

export function createEmptyOutput(): AgentOutput {
  return {
    answer: "",
    citations: [],
    confidence: 0.0,
    evidence: [],
    limitations: "No evidence retrieved from 0G Storage.",
    contradictions: [],
  };
}

export function validateAgentOutput(output: unknown): output is AgentOutput {
  if (!output || typeof output !== "object") return false;
  const o = output as Record<string, unknown>;

  if (typeof o.answer !== "string") return false;
  if (!Array.isArray(o.citations)) return false;
  if (typeof o.confidence !== "number") return false;
  if (o.confidence < 0 || o.confidence > 1) return false;
  if (!Array.isArray(o.evidence)) return false;
  if (typeof o.limitations !== "string") return false;
  if (!Array.isArray(o.contradictions)) return false;

  for (const c of o.citations) {
    if (typeof c !== "object" || c === null) return false;
    const citation = c as Record<string, unknown>;
    if (typeof citation.chunkId !== "string") return false;
    if (typeof citation.quote !== "string") return false;
    if (typeof citation.sourceUrl !== "string") return false;
    if (typeof citation.observedAt !== "string") return false;
    if (typeof citation.storagePointer !== "string") return false;
  }

  for (const contr of o.contradictions) {
    if (typeof contr !== "object" || contr === null) return false;
    const c = contr as Record<string, unknown>;
    if (typeof c.description !== "string") return false;
    if (!Array.isArray(c.chunkIds)) return false;
  }

  return true;
}

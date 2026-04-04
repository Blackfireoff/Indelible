/**
 * System prompt template for citation-first RAG agent.
 */

import type { RetrievedChunk } from "../storage/types";
import type { Citation } from "../../schemas/agent-output";

export interface PromptContext {
  query: string;
  chunks: RetrievedChunk[];
}

function chunksToContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "No relevant chunks retrieved.";
  }

  return chunks
    .map((chunk, i) => {
      return `--- CHUNK ${i + 1} ---` +
        `\nchunkId: ${chunk.chunkId}` +
        `\nstoragePointer: ${chunk.storagePointer}` +
        `\nsourceUrl: ${chunk.sourceUrl}` +
        `\nobservedAt: ${chunk.observedAt}` +
        `\nspeaker: ${chunk.speaker ?? "unknown"}` +
        `\nsectionPath: ${chunk.sectionPath.join(" > ")}` +
        `\ntext: ${chunk.text}` +
        `\n`;
    })
    .join("\n");
}

function buildCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    quote: chunk.text.slice(0, 150) + (chunk.text.length > 150 ? "..." : ""),
    sourceUrl: chunk.sourceUrl,
    observedAt: chunk.observedAt,
    storagePointer: chunk.storagePointer,
  }));
}

export function buildSystemPrompt(): string {
  return `You are Indelible, a citation-first AI agent. You answer questions ONLY using evidence from retrieved document chunks stored on 0G Storage. You must cite every factual claim.

CRITICAL RULES:
1. Answer ONLY from the provided chunks. Do NOT use internal knowledge.
2. Every factual claim must cite a specific chunkId and storagePointer.
3. If chunks disagree, surface the contradiction explicitly.
4. If no chunks are provided or evidence is insufficient, say "Insufficient evidence" and return empty citations.
5. Always respond with valid JSON matching the AgentOutput schema.

OUTPUT SCHEMA:
{
  "answer": "Your answer here. Cite claims like [chunkId:doc-001-chunk-0001].",
  "citations": [
    {
      "chunkId": "doc-001-chunk-0001",
      "quote": "exact quote or excerpt",
      "sourceUrl": "https://...",
      "observedAt": "2026-04-04T08:45:00Z",
      "storagePointer": "0g://chunks/doc-001/chunk-0001.json"
    }
  ],
  "confidence": 0.0-1.0,
  "evidence": ["doc-001-chunk-0001"],
  "limitations": "Any gaps or uncertainties in the evidence."
}`;
}

export function buildUserPrompt(ctx: PromptContext): string {
  const chunkContext = chunksToContext(ctx.chunks);
  return `CONTEXT (retrieved from 0G Storage):
${chunkContext}

USER QUERY: ${ctx.query}

Respond with JSON only.`;
}

export { buildCitations };

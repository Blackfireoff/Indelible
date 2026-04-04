/**
 * LLM Refinement step – uses a local OpenAI-compatible endpoint (e.g. LM Studio)
 * to extract statements from the already-cleaned article JSON.
 *
 * Rules (non-negotiable):
 *  1. Never sends raw HTML to the LLM – only clean paragraph text.
 *  2. If the endpoint is unreachable, returns [] and logs a warning.
 *  3. Every returned statement is verified against the source text before export.
 *  4. schema-validated JSON output only (strict parsing with fallback).
 *
 * Env vars:
 *  ENABLE_LLM_REFINEMENT   "true" | "false"
 *  LOCAL_LLM_BASE_URL      e.g. "http://127.0.0.1:1234/v1"
 *  LOCAL_LLM_API_KEY       e.g. "lm-studio"
 *  LOCAL_LLM_MODEL         e.g. "qwen2.5-7b-instruct"
 *  LOCAL_LLM_TIMEOUT_MS    e.g. "60000"
 */

import type { CleanArticle, ArticleParagraph } from "../schemas/cleanArticle.js";
import type { LlmRawStatement, StatementType } from "../schemas/refinedStatements.js";

// ─── Configuration ────────────────────────────────────────────────────────────

export interface LlmRefinementConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  /** Max paragraphs per LLM request window (default 6) */
  windowSize?: number;
}

function resolveConfig(cfg: LlmRefinementConfig = {}): Required<LlmRefinementConfig> {
  return {
    baseUrl: cfg.baseUrl ?? process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:1234/v1",
    apiKey: cfg.apiKey ?? process.env.LOCAL_LLM_API_KEY ?? "lm-studio",
    model: cfg.model ?? process.env.LOCAL_LLM_MODEL ?? "local-model",
    timeoutMs: cfg.timeoutMs ?? parseInt(process.env.LOCAL_LLM_TIMEOUT_MS ?? "60000", 10),
    windowSize: cfg.windowSize ?? 6,
  };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a political statement extractor working on a journalism fact-checking system.

Your input is a JSON object with a list of paragraphs from a cleaned news article.
Your task is to extract all noteworthy political statements.

STRICT RULES:
1. "statement_text" MUST be an exact verbatim substring of one of the provided paragraphs.
   Do NOT paraphrase, summarize, or invent text.
2. "evidence_paragraph_ids" MUST contain only paragraph IDs that appear in the input.
3. "speaker" must be the full name or "null" if truly unknown.
4. Only extract statements by named people or officials.
5. Output ONLY valid JSON matching the schema below. No markdown. No explanation.

Output schema (return as a JSON object with a "statements" array):
{
  "statements": [
    {
      "speaker": "Full Name or null",
      "speaker_role": "Title or role or null",
      "statement_text": "exact verbatim text from the paragraph",
      "statement_type": "direct_quote | reported_speech | claim | denial | threat | promise | background",
      "attribution_text": "the attribution phrase (e.g. 'Trump said') or null",
      "evidence_paragraph_ids": ["para_id_here"],
      "confidence": 0.0
    }
  ]
}`;

function buildUserMessage(paragraphs: ArticleParagraph[]): string {
  const paraJson = paragraphs.map((p) => ({
    id: p.paragraphId,
    order: p.order,
    text: p.text,
  }));
  return `Extract political statements from these article paragraphs:\n\n${JSON.stringify({ paragraphs: paraJson }, null, 2)}`;
}

// ─── Schema validation ────────────────────────────────────────────────────────

const VALID_STATEMENT_TYPES = new Set<StatementType>([
  "direct_quote",
  "reported_speech",
  "claim",
  "denial",
  "threat",
  "promise",
  "background",
]);

function isValidStatementType(v: unknown): v is StatementType {
  return typeof v === "string" && VALID_STATEMENT_TYPES.has(v as StatementType);
}

function parseAndValidateLlmOutput(raw: string): LlmRawStatement[] {
  let parsed: unknown;
  try {
    // Strip markdown code fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn("[llmRefinement] Failed to parse LLM JSON output");
    return [];
  }

  // Accept both {statements:[...]} and [...] forms
  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as Record<string, unknown>).statements)
  ) {
    items = (parsed as Record<string, unknown>).statements as unknown[];
  } else {
    console.warn("[llmRefinement] LLM output has unexpected shape");
    return [];
  }

  const results: LlmRawStatement[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;

    const statementText = typeof obj.statement_text === "string" ? obj.statement_text.trim() : "";
    if (!statementText || statementText.length < 10) continue;

    const statementType = isValidStatementType(obj.statement_type)
      ? obj.statement_type
      : "claim";

    const evidenceIds = Array.isArray(obj.evidence_paragraph_ids)
      ? (obj.evidence_paragraph_ids as unknown[])
          .filter((id): id is string => typeof id === "string")
      : [];

    const confidence =
      typeof obj.confidence === "number"
        ? Math.max(0, Math.min(1, obj.confidence))
        : 0.5;

    results.push({
      speaker: typeof obj.speaker === "string" && obj.speaker !== "null"
        ? obj.speaker.trim()
        : null,
      speaker_role: typeof obj.speaker_role === "string" && obj.speaker_role !== "null"
        ? obj.speaker_role.trim()
        : null,
      statement_text: statementText,
      statement_type: statementType,
      attribution_text: typeof obj.attribution_text === "string" && obj.attribution_text !== "null"
        ? obj.attribution_text.trim()
        : null,
      evidence_paragraph_ids: evidenceIds,
      confidence,
    });
  }

  return results;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Run LLM refinement on a clean article to extract statements.
 *
 * @returns Array of raw LLM statements (unverified). Empty array on failure.
 */
export async function runLlmRefinement(
  article: CleanArticle,
  config: LlmRefinementConfig = {}
): Promise<{ statements: LlmRawStatement[]; modelUsed: string }> {
  const cfg = resolveConfig(config);

  // Probe availability
  console.log(`[llmRefinement] Connecting to ${cfg.baseUrl} (model: ${cfg.model})`);

  let OpenAI: typeof import("openai").default;
  try {
    const mod = await import("openai");
    OpenAI = mod.default;
  } catch {
    console.warn("[llmRefinement] openai package not available – skipping LLM refinement");
    return { statements: [], modelUsed: cfg.model };
  }

  const client = new OpenAI({
    baseURL: cfg.baseUrl,
    apiKey: cfg.apiKey,
    timeout: cfg.timeoutMs,
    maxRetries: 1,
  });

  const allStatements: LlmRawStatement[] = [];
  const { windowSize } = cfg;
  const paragraphs = article.paragraphs;

  // Process in sliding windows to stay within context limits
  for (let i = 0; i < paragraphs.length; i += windowSize) {
    const window = paragraphs.slice(i, i + windowSize);
    const windowLabel = `paragraphs ${i + 1}–${Math.min(i + windowSize, paragraphs.length)} of ${paragraphs.length}`;

    try {
      console.log(`[llmRefinement] Processing ${windowLabel} …`);
      const response = await client.chat.completions.create({
        model: cfg.model,
        temperature: 0,
        max_tokens: 2048,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(window) },
        ],
      });

      const rawContent = response.choices[0]?.message?.content ?? "";
      const parsed = parseAndValidateLlmOutput(rawContent);
      console.log(`[llmRefinement] Window extracted ${parsed.length} statement(s)`);
      allStatements.push(...parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      // Connection refused → endpoint not running
      if (
        msg.includes("ECONNREFUSED") ||
        msg.includes("fetch failed") ||
        msg.includes("connect ECONNREFUSED") ||
        msg.includes("Failed to fetch")
      ) {
        console.warn(
          `[llmRefinement] LLM endpoint not reachable at ${cfg.baseUrl}. ` +
          "Falling back to deterministic-only mode."
        );
        return { statements: [], modelUsed: cfg.model };
      }

      // Timeout or other transient error – log and continue with next window
      console.warn(`[llmRefinement] Window ${windowLabel} failed: ${msg.slice(0, 120)}`);
    }
  }

  // Deduplicate by statement_text
  const seen = new Set<string>();
  const deduped = allStatements.filter((s) => {
    const key = s.statement_text.slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(
    `[llmRefinement] Total: ${deduped.length} unique statement(s) extracted by LLM`
  );
  return { statements: deduped, modelUsed: cfg.model };
}

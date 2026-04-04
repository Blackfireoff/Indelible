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
  /** Max paragraphs per LLM request window (default 5) */
  windowSize?: number;
  /** Max application-level retry attempts per window (default 2) */
  maxWindowRetries?: number;
}

function resolveConfig(cfg: LlmRefinementConfig = {}): Required<LlmRefinementConfig> {
  return {
    baseUrl: cfg.baseUrl ?? process.env.LOCAL_LLM_BASE_URL ?? "http://127.0.0.1:1234/v1",
    apiKey: cfg.apiKey ?? process.env.LOCAL_LLM_API_KEY ?? "lm-studio",
    model: cfg.model ?? process.env.LOCAL_LLM_MODEL ?? "local-model",
    timeoutMs: cfg.timeoutMs ?? parseInt(process.env.LOCAL_LLM_TIMEOUT_MS ?? "60000", 10),
    windowSize: cfg.windowSize ?? 5,
    maxWindowRetries: cfg.maxWindowRetries ?? 2,
  };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a political statement extractor for a journalism fact-checking system.

INPUT: A JSON object with "paragraphs" (each has "id" and "text").
OUTPUT: A JSON object { "statements": [...] }.

══ ABSOLUTE RULES ══
1. "statement_text" MUST be copied CHARACTER FOR CHARACTER from the paragraph text. No rewording. No summary. No paraphrase.
2. "evidence_paragraph_ids" MUST contain ONLY IDs that appear in the INPUT. Never invent IDs.
3. Only extract statements where a named person (politician, official, spokesperson) is clearly the source.
4. Output ONLY the raw JSON object. No markdown. No code fences. No explanation before or after.
5. If a paragraph contains a direct quote in quotation marks attributed to a named person, you MUST include it.
6. Do NOT include background facts or context not attributed to a specific person.

══ FIELD REFERENCE ══
statement_text   : verbatim copy from paragraph (required)
speaker          : full name as written in the article, or null
speaker_role     : role/title or null
statement_type   : one of [direct_quote, reported_speech, claim, denial, threat, promise, background]
attribution_text : the phrase like "Trump said" or "according to X" that links speaker to statement, or null
evidence_paragraph_ids : array of IDs from the input (required, at least one)
confidence       : float 0.0–1.0

══ OUTPUT SCHEMA ══
{"statements":[{"speaker":"...","speaker_role":"...","statement_text":"...","statement_type":"direct_quote","attribution_text":"...","evidence_paragraph_ids":["para_id"],"confidence":0.9}]}`;

function buildUserMessage(paragraphs: ArticleParagraph[]): string {
  const paraJson = paragraphs.map((p) => ({
    id: p.paragraphId,
    text: p.text,
  }));
  const validIds = paragraphs.map((p) => p.paragraphId);
  return (
    `Valid paragraph IDs for this request: ${JSON.stringify(validIds)}\n\n` +
    `Extract all political statements from:\n\n` +
    JSON.stringify({ paragraphs: paraJson }, null, 2)
  );
}

/** Retry prompt variant – used when first attempt returns empty on a window with quotes. */
function buildRetryUserMessage(paragraphs: ArticleParagraph[], quoteSnippets: string[]): string {
  const paraJson = paragraphs.map((p) => ({ id: p.paragraphId, text: p.text }));
  const validIds = paragraphs.map((p) => p.paragraphId);
  return (
    `Valid paragraph IDs: ${JSON.stringify(validIds)}\n\n` +
    `IMPORTANT: The following direct quotes were detected in the text and MUST be extracted:\n` +
    quoteSnippets.map((q) => `  - "${q}"`).join("\n") + "\n\n" +
    `Extract ALL political statements from:\n\n` +
    JSON.stringify({ paragraphs: paraJson }, null, 2)
  );
}

// ─── Quote detection (for retry trigger) ─────────────────────────────────────

/**
 * Returns up to 3 snippets of quoted text in `texts` that look like
 * attributable political statements (≥ 15 chars inside quotes).
 */
function detectQuoteSnippets(paragraphs: ArticleParagraph[]): string[] {
  const snippets: string[] = [];
  const quoteRe = /"([^"]{15,}?)"/g;
  for (const para of paragraphs) {
    for (const m of para.text.matchAll(quoteRe)) {
      const q = m[1].trim();
      if (q.length >= 15 && snippets.length < 3) snippets.push(q.slice(0, 120));
    }
    if (snippets.length >= 3) break;
  }
  return snippets;
}

// ─── JSON extraction ──────────────────────────────────────────────────────────

/**
 * Robustly extract JSON from LLM output.
 *
 * Handles:
 *  - Markdown code fences (```json ... ```)
 *  - Leading/trailing prose before/after the JSON
 *  - BOM characters
 *
 * Strategy: find the first `{` or `[`, then use a brace counter to locate
 * the matching close brace/bracket. Avoids fragile regex-on-JSON.
 */
function extractJsonFromOutput(raw: string): string | null {
  // Strip BOM
  const text = raw.replace(/^\uFEFF/, "").trim();

  // 1. Try stripping fences anywhere in the string (multiline)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    if (inner.startsWith("{") || inner.startsWith("[")) return inner;
  }

  // 2. Find first { or [ and walk to matching close
  const startBrace = text.indexOf("{");
  const startBracket = text.indexOf("[");
  let start = -1;
  let openChar: string;
  let closeChar: string;

  if (startBrace === -1 && startBracket === -1) return null;
  if (startBrace === -1) { start = startBracket; openChar = "["; closeChar = "]"; }
  else if (startBracket === -1) { start = startBrace; openChar = "{"; closeChar = "}"; }
  else if (startBrace < startBracket) { start = startBrace; openChar = "{"; closeChar = "}"; }
  else { start = startBracket; openChar = "["; closeChar = "]"; }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

// ─── Schema validation ────────────────────────────────────────────────────────

const VALID_STATEMENT_TYPES = new Set<StatementType>([
  "direct_quote", "reported_speech", "claim",
  "denial", "threat", "promise", "background",
]);

function isValidStatementType(v: unknown): v is StatementType {
  return typeof v === "string" && VALID_STATEMENT_TYPES.has(v as StatementType);
}

/**
 * Parse and validate LLM output.
 * Returns validated statements, filtering out items with bad schema.
 * `validParaIds` – if provided, evidence_paragraph_ids with unknown IDs are dropped.
 */
function parseAndValidateLlmOutput(
  raw: string,
  validParaIds?: Set<string>
): { statements: LlmRawStatement[]; parseError: string | null } {
  const jsonStr = extractJsonFromOutput(raw);

  if (!jsonStr) {
    return {
      statements: [],
      parseError: `No JSON object/array found in output (first 200 chars): ${raw.slice(0, 200)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return {
      statements: [],
      parseError: `JSON.parse failed: ${(e as Error).message}. Extracted: ${jsonStr.slice(0, 200)}`,
    };
  }

  // Accept both {statements:[...]} and [...]
  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (
    typeof parsed === "object" && parsed !== null &&
    Array.isArray((parsed as Record<string, unknown>).statements)
  ) {
    items = (parsed as Record<string, unknown>).statements as unknown[];
  } else {
    return {
      statements: [],
      parseError: `Unexpected JSON shape: ${JSON.stringify(parsed).slice(0, 200)}`,
    };
  }

  const results: LlmRawStatement[] = [];

  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;

    const statementText =
      typeof obj.statement_text === "string" ? obj.statement_text.trim() : "";
    if (!statementText || statementText.length < 10) {
      console.warn("[llmRefinement] Skipping item: statement_text too short or missing");
      continue;
    }

    // Validate and filter evidence_paragraph_ids
    const rawIds = Array.isArray(obj.evidence_paragraph_ids)
      ? (obj.evidence_paragraph_ids as unknown[]).filter((id): id is string => typeof id === "string")
      : [];

    let evidenceIds = rawIds;
    if (validParaIds && rawIds.length > 0) {
      const knownIds = rawIds.filter((id) => validParaIds.has(id));
      const unknownIds = rawIds.filter((id) => !validParaIds.has(id));
      if (unknownIds.length > 0) {
        console.warn(
          `[llmRefinement] Dropping unknown paragraph IDs: ${unknownIds.join(", ")} ` +
          `(valid: ${[...validParaIds].join(", ")})`
        );
      }
      // Keep known IDs; if all were invalid, leave empty (verifier will search all paragraphs)
      evidenceIds = knownIds;
    }

    const confidence =
      typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0.5;

    results.push({
      speaker:
        typeof obj.speaker === "string" && obj.speaker !== "null"
          ? obj.speaker.trim() : null,
      speaker_role:
        typeof obj.speaker_role === "string" && obj.speaker_role !== "null"
          ? obj.speaker_role.trim() : null,
      statement_text: statementText,
      statement_type: isValidStatementType(obj.statement_type)
        ? obj.statement_type : "claim",
      attribution_text:
        typeof obj.attribution_text === "string" && obj.attribution_text !== "null"
          ? obj.attribution_text.trim() : null,
      evidence_paragraph_ids: evidenceIds,
      confidence,
    });
  }

  return { statements: results, parseError: null };
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function runLlmRefinement(
  article: CleanArticle,
  config: LlmRefinementConfig = {}
): Promise<{ statements: LlmRawStatement[]; modelUsed: string }> {
  const cfg = resolveConfig(config);

  console.log(`[llmRefinement] Connecting to ${cfg.baseUrl} (model: ${cfg.model})`);

  let OpenAI: typeof import("openai").default;
  try {
    const mod = await import("openai");
    OpenAI = mod.default;
  } catch {
    console.warn("[llmRefinement] openai package not available – skipping LLM refinement");
    return { statements: [], modelUsed: cfg.model };
  }

  // maxRetries: 0 here because we implement our own application-level retry
  const client = new OpenAI({
    baseURL: cfg.baseUrl,
    apiKey: cfg.apiKey,
    timeout: cfg.timeoutMs,
    maxRetries: 0,
  });

  const allStatements: LlmRawStatement[] = [];
  const { windowSize, maxWindowRetries } = cfg;
  const paragraphs = article.paragraphs;

  for (let i = 0; i < paragraphs.length; i += windowSize) {
    const window = paragraphs.slice(i, i + windowSize);
    const windowLabel = `window ${Math.floor(i / windowSize) + 1} (paras ${i + 1}–${Math.min(i + windowSize, paragraphs.length)}/${paragraphs.length})`;
    const validParaIds = new Set(window.map((p) => p.paragraphId));

    let windowStatements: LlmRawStatement[] = [];
    let succeeded = false;

    for (let attempt = 1; attempt <= maxWindowRetries; attempt++) {
      // On retry, use an augmented prompt if quotes were detected but first call returned nothing
      const quoteSnippets = detectQuoteSnippets(window);
      const isRetryWithQuotes = attempt > 1 && quoteSnippets.length > 0 && windowStatements.length === 0;
      const userMsg = isRetryWithQuotes
        ? buildRetryUserMessage(window, quoteSnippets)
        : buildUserMessage(window);

      const attemptLabel = attempt > 1 ? ` (retry ${attempt}/${maxWindowRetries})` : "";
      console.log(`[llmRefinement] Processing ${windowLabel}${attemptLabel} …`);

      let rawContent: string;
      try {
        const response = await client.chat.completions.create({
          model: cfg.model,
          temperature: 0,
          max_tokens: 2048,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMsg },
          ],
        });
        rawContent = response.choices[0]?.message?.content ?? "";
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Connection refused → endpoint not running, abort entire refinement
        if (
          msg.includes("ECONNREFUSED") ||
          msg.includes("fetch failed") ||
          msg.includes("connect ECONNREFUSED") ||
          msg.includes("Failed to fetch") ||
          msg.includes("ENOTFOUND")
        ) {
          console.warn(
            `[llmRefinement] LLM endpoint not reachable at ${cfg.baseUrl}. ` +
            "Falling back to deterministic-only mode."
          );
          return { statements: [], modelUsed: cfg.model };
        }
        // Other error (timeout, etc.) – log and retry
        console.warn(`[llmRefinement] ${windowLabel} attempt ${attempt} failed: ${msg.slice(0, 120)}`);
        continue;
      }

      const { statements: parsed, parseError } = parseAndValidateLlmOutput(rawContent, validParaIds);

      if (parseError) {
        console.warn(`[llmRefinement] ${windowLabel} attempt ${attempt} parse error: ${parseError}`);
        // Only retry if we haven't exhausted attempts
        if (attempt < maxWindowRetries) continue;
        break;
      }

      windowStatements = parsed;

      // Check if output is suspiciously empty when quotes exist in the window
      if (parsed.length === 0 && detectQuoteSnippets(window).length > 0 && attempt < maxWindowRetries) {
        console.warn(
          `[llmRefinement] ${windowLabel} attempt ${attempt} returned 0 statements ` +
          `but quotes were detected — retrying with explicit hint`
        );
        continue;
      }

      succeeded = true;
      break;
    }

    console.log(
      `[llmRefinement] ${windowLabel}: ${windowStatements.length} statement(s)${succeeded ? "" : " (gave up after retries)"}`
    );
    allStatements.push(...windowStatements);
  }

  // Deduplicate by first 80 chars of statement_text
  const seen = new Set<string>();
  const deduped = allStatements.filter((s) => {
    const key = s.statement_text.slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[llmRefinement] Total: ${deduped.length} unique statement(s) extracted by LLM`);
  return { statements: deduped, modelUsed: cfg.model };
}

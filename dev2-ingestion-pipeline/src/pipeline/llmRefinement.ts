/**
 * LLM Refinement step — extrait des déclarations depuis le JSON article (pas de HTML).
 *
 * Fournisseurs :
 *  - `local` : endpoint compatible OpenAI (LM Studio, etc.) — comportement historique.
 *  - `0g`    : 0G Compute via `@0glabs/0g-serving-broker` (comme dev3-AI-RAG).
 *
 * Rules (non-negotiable):
 *  1. Never sends raw HTML to the LLM – only clean paragraph text.
 *  2. If the endpoint / 0G init fails, returns [] and logs a warning.
 *  3. Every returned statement is verified against the source text before export.
 *  4. schema-validated JSON output only (strict parsing with fallback).
 *
 * Env vars (voir aussi `.env.example`) :
 *  ENABLE_LLM_REFINEMENT     "true" | "false"
 *  LLM_REFINEMENT_PROVIDER   "local" | "0g"   (défaut: local)
 *
 * Local :
 *  LOCAL_LLM_BASE_URL, LOCAL_LLM_API_KEY, LOCAL_LLM_MODEL, LOCAL_LLM_TIMEOUT_MS
 *
 * 0G Compute :
 *  ZEROG_PRIVATE_KEY ou LLM_0G_PRIVATE_KEY
 *  LLM_0G_RPC_URL ou ZEROG_RPC_URL
 *  LLM_0G_PROVIDER_ADDRESS   (optionnel — sinon premier service "chatbot")
 *  LLM_0G_MODEL              (optionnel — sinon modèle du service)
 *  LLM_0G_MAX_TOKENS
 */

import type OpenAI from "openai";
import type { CleanArticle, ArticleParagraph } from "../schemas/cleanArticle.js";
import type { LlmRawStatement, StatementType } from "../schemas/refinedStatements.js";
import { ensureZerogLlmClient } from "./zerogLlmClient.js";
import {
  completeLlmChat,
  extractJsonFromOutput,
  resolveLlmConfig,
  type LlmRefinementConfig,
} from "./llmShared.js";

export type { LlmRefinementConfig, LlmRefinementProvider } from "./llmShared.js";

const resolveConfig = resolveLlmConfig;

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a political statement extractor for a journalism fact-checking system.

INPUT: A JSON object with "paragraphs" (each has "id" and "text").
OUTPUT: A JSON object { "statements": [...] }.

══ ABSOLUTE RULES ══
1. "statement_text" MUST be copied CHARACTER FOR CHARACTER from the paragraph text. No rewording. No summary. No paraphrase.
2. "evidence_paragraph_ids" MUST contain ONLY IDs that appear in the INPUT. Never invent IDs.
3. Extract statements where someone is clearly the source of the words (direct quote or clearly attributed reported speech). Prefer politicians, officials, and named actors.
4. Output ONLY the raw JSON object. No markdown. No code fences. No explanation before or after.
5. If a paragraph contains a direct quote in quotation marks with attribution, you MUST include it.
6. Do NOT include background facts or narrator-only context with no attributable speaker.

══ SPEAKER (MANDATORY) ══
7. For EVERY statement you output, "speaker" MUST be a non-empty string. Never use null, "", or omit the field.
8. Name who is speaking using the BEST reading of the paragraph: exact name or title as in the text when possible.
9. If attribution is indirect (e.g. pronoun or "the official" after a name was given earlier in the SAME paragraph), resolve it to that person or entity for "speaker".
10. If several interpretations are possible, choose the single most plausible speaker and set "confidence" accordingly (lower when uncertain).
11. If you truly cannot identify any speaker, do NOT emit that row at all (omit the statement rather than leaving "speaker" empty).

══ FIELD REFERENCE ══
statement_text   : verbatim copy from paragraph (required)
speaker          : non-empty string — who is treated as the source of this statement (required)
speaker_role     : role/title or null
statement_type   : one of [direct_quote, reported_speech, claim, denial, threat, promise, background]
attribution_text : short phrase grounding the link (e.g. "Trump said", "according to the ministry"); use null only if impossible
evidence_paragraph_ids : array of IDs from the input (required, at least one)
confidence       : float 0.0–1.0

══ OUTPUT SCHEMA ══
{"statements":[{"speaker":"Full Name or Title","speaker_role":"...","statement_text":"...","statement_type":"direct_quote","attribution_text":"...","evidence_paragraph_ids":["para_id"],"confidence":0.9}]}`;

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

  let localClient: OpenAI | null = null;

  if (cfg.provider === "local") {
    console.log(`[llmRefinement] Provider=local → ${cfg.baseUrl} (model: ${cfg.model})`);
    try {
      const mod = await import("openai");
      localClient = new mod.default({
        baseURL: cfg.baseUrl,
        apiKey: cfg.apiKey,
        timeout: cfg.timeoutMs,
        maxRetries: 0,
      });
    } catch {
      console.warn("[llmRefinement] openai package not available – skipping LLM refinement");
      return { statements: [], modelUsed: cfg.model };
    }
  } else {
    console.log("[llmRefinement] Provider=0g (0G Compute) …");
    try {
      const z = await ensureZerogLlmClient({});
      console.log(
        `[llmRefinement] 0G endpoint: ${z.endpoint} | service model: ${z.defaultModel} | provider: ${z.providerAddress.slice(0, 10)}…`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[llmRefinement] 0G init failed: ${msg} — skipping LLM refinement.`);
      return { statements: [], modelUsed: cfg.model };
    }
  }

  const allStatements: LlmRawStatement[] = [];
  const { windowSize, maxWindowRetries } = cfg;
  const paragraphs = article.paragraphs;
  let lastModelUsed = cfg.model;

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
        const out = await completeLlmChat(cfg, localClient, SYSTEM_PROMPT, userMsg);
        rawContent = out.rawContent;
        lastModelUsed = out.modelUsed;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const networkLike =
          msg.includes("ECONNREFUSED") ||
          msg.includes("fetch failed") ||
          msg.includes("connect ECONNREFUSED") ||
          msg.includes("Failed to fetch") ||
          msg.includes("ENOTFOUND");

        if (networkLike && cfg.provider === "local") {
          console.warn(
            `[llmRefinement] LLM endpoint not reachable at ${cfg.baseUrl}. ` +
              "Falling back to deterministic-only mode.",
          );
          return { statements: [], modelUsed: cfg.model };
        }
        if (networkLike && cfg.provider === "0g") {
          console.warn(
            `[llmRefinement] 0G inference unreachable or failed: ${msg.slice(0, 200)} — aborting refinement.`,
          );
          return { statements: [], modelUsed: lastModelUsed };
        }
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
  return { statements: deduped, modelUsed: lastModelUsed };
}

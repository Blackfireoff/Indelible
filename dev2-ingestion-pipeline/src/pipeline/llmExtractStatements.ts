/**
 * Extraction des statements au format pipeline (`Statement[]`) depuis `clean_article.json`
 * via LLM uniquement — remplace l’ancien extracteur à règles.
 */

import type OpenAI from "openai";
import type { CleanArticle, ArticleParagraph } from "../schemas/cleanArticle.js";
import type { Statement, QuoteType } from "../schemas/statements.js";
import { statementId } from "../utils/ids.js";
import { normalizeSpeaker } from "../utils/speakerNormalization.js";
import { findExactSpan, findNormalizedSpan, extractContextWindow } from "../utils/offsets.js";
import { ensureZerogLlmClient } from "./zerogLlmClient.js";
import {
  completeLlmChat,
  extractJsonFromOutput,
  resolveLlmConfig,
  type LlmRefinementConfig,
} from "./llmShared.js";

const SYSTEM_PROMPT = `You are an expert at extracting attributed political or official speech from news article paragraphs.

INPUT: JSON with "paragraphs": [{ "id", "text" }, ...] from a clean article (no HTML).
OUTPUT: A single JSON object: { "statements": [ ... ] }.

══ RULES ══
1. "content" MUST be copied CHARACTER-FOR-CHARACTER from exactly one paragraph's "text". No paraphrase.
2. "source_paragraph_id" MUST be the "id" of that paragraph (copy exactly).
3. "speaker" MUST be non-empty — who is attributed as the source of this speech (best judgment from the paragraph).
4. Use "quote_type": "direct" for text inside quotation marks attributed to the speaker; "indirect" for reported speech without quotes.
5. "cue" is a short attribution phrase if visible (e.g. "said", "according to X"), or null.
6. Output ONLY valid JSON. No markdown fences. No commentary.

══ SCHEMA (each item in "statements") ══
{
  "content": "verbatim substring from the paragraph",
  "speaker": "Full name or title as source",
  "speaker_role": "optional role or null",
  "quote_type": "direct" | "indirect",
  "cue": "string or null",
  "source_paragraph_id": "must match a paragraph id from INPUT",
  "confidence": 0.0-1.0
}`;

function buildUserMessage(paragraphs: ArticleParagraph[]): string {
  const paraJson = paragraphs.map((p) => ({
    id: p.paragraphId,
    text: p.text,
  }));
  const validIds = paragraphs.map((p) => p.paragraphId);
  return (
    `Valid paragraph IDs: ${JSON.stringify(validIds)}\n\n` +
    `Extract attributed statements from:\n\n` +
    JSON.stringify({ paragraphs: paraJson }, null, 2)
  );
}

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

function buildRetryUserMessage(paragraphs: ArticleParagraph[], quoteSnippets: string[]): string {
  const paraJson = paragraphs.map((p) => ({ id: p.paragraphId, text: p.text }));
  const validIds = paragraphs.map((p) => p.paragraphId);
  return (
    `Valid paragraph IDs: ${JSON.stringify(validIds)}\n\n` +
    `These quotes appear in the text — extract them with correct "content" and "source_paragraph_id":\n` +
    quoteSnippets.map((q) => `  - "${q}"`).join("\n") +
    `\n\nFull input:\n\n` +
    JSON.stringify({ paragraphs: paraJson }, null, 2)
  );
}

interface LlmStatementRow {
  content: string;
  speaker: string;
  speaker_role: string | null;
  quote_type: string;
  cue: string | null;
  source_paragraph_id: string;
  confidence: number;
}

function mapQuoteType(raw: string): QuoteType {
  const r = raw.toLowerCase();
  if (r === "direct") return "direct";
  if (r === "indirect" || r === "reported_speech" || r === "reported") return "indirect";
  return "indirect";
}

function rowToStatement(
  row: LlmStatementRow,
  paraById: Map<string, ArticleParagraph>,
  attestationId: string,
  contextWindowSize: number,
): Statement | null {
  const pid = typeof row.source_paragraph_id === "string" ? row.source_paragraph_id.trim() : "";
  const para = paraById.get(pid);
  if (!para) {
    console.warn(`[llmExtractStatements] Unknown paragraph id: ${pid}`);
    return null;
  }

  const content = typeof row.content === "string" ? row.content.trim() : "";
  if (content.length < 5) return null;

  let span = findExactSpan(para.text, content);
  if (!span) span = findNormalizedSpan(para.text, content);
  if (!span) {
    console.warn(`[llmExtractStatements] content not found in paragraph ${pid}: "${content.slice(0, 80)}…"`);
    return null;
  }

  const [charStart, charEnd] = span;
  const matchedText = para.text.slice(charStart, charEnd);

  const speakerName = typeof row.speaker === "string" ? row.speaker.trim() : "";
  if (!speakerName) {
    console.warn("[llmExtractStatements] Skipping row with empty speaker");
    return null;
  }

  const role =
    typeof row.speaker_role === "string" && row.speaker_role.trim() ? row.speaker_role.trim() : null;
  const normalizedId = normalizeSpeaker(speakerName);
  const cue =
    typeof row.cue === "string" && row.cue.trim() ? row.cue.trim() : null;
  const confidence =
    typeof row.confidence === "number" ? Math.max(0, Math.min(1, row.confidence)) : 0.75;

  return {
    statementId: statementId(attestationId, pid, charStart, charEnd),
    speaker: { name: speakerName, role, normalizedId },
    quoteType: mapQuoteType(row.quote_type ?? "indirect"),
    content: matchedText,
    cue,
    sourceParagraphId: pid,
    charStart,
    charEnd,
    contextWindow: extractContextWindow(para.text, charStart, charEnd, contextWindowSize),
    confidence,
    validation: { status: "auto_accepted", reviewRequired: false },
  };
}

function parseRows(raw: string, validParaIds: Set<string>): LlmStatementRow[] {
  const jsonStr = extractJsonFromOutput(raw);
  if (!jsonStr) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return [];
  }

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
    return [];
  }

  const out: LlmStatementRow[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const content = typeof o.content === "string" ? o.content : "";
    const speaker = typeof o.speaker === "string" ? o.speaker : "";
    const pid = typeof o.source_paragraph_id === "string" ? o.source_paragraph_id.trim() : "";
    if (!content || !speaker || !pid) continue;
    if (validParaIds.size > 0 && !validParaIds.has(pid)) continue;

    out.push({
      content,
      speaker,
      speaker_role: typeof o.speaker_role === "string" ? o.speaker_role : null,
      quote_type: typeof o.quote_type === "string" ? o.quote_type : "indirect",
      cue: typeof o.cue === "string" ? o.cue : null,
      source_paragraph_id: pid,
      confidence: typeof o.confidence === "number" ? o.confidence : 0.75,
    });
  }
  return out;
}

/**
 * Extrait des `Statement[]` depuis le clean article via LLM (local ou 0G).
 */
export async function extractStatementsFromCleanArticle(
  article: CleanArticle,
  attestationId: string,
  config: LlmRefinementConfig = {},
): Promise<{ statements: Statement[]; modelUsed: string }> {
  const cfg = resolveLlmConfig(config);
  const contextWindowSize = 200;

  let localClient: OpenAI | null = null;

  if (cfg.provider === "local") {
    console.log(`[llmExtractStatements] Provider=local → ${cfg.baseUrl} (model: ${cfg.model})`);
    try {
      const mod = await import("openai");
      localClient = new mod.default({
        baseURL: cfg.baseUrl,
        apiKey: cfg.apiKey,
        timeout: cfg.timeoutMs,
        maxRetries: 0,
      });
    } catch {
      console.warn("[llmExtractStatements] openai package not available — no statements extracted.");
      return { statements: [], modelUsed: cfg.model };
    }
  } else {
    console.log("[llmExtractStatements] Provider=0g (0G Compute) …");
    try {
      const z = await ensureZerogLlmClient({});
      console.log(
        `[llmExtractStatements] 0G endpoint: ${z.endpoint} | model: ${z.defaultModel} | provider: ${z.providerAddress.slice(0, 10)}…`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[llmExtractStatements] 0G init failed: ${msg} — no statements extracted.`);
      return { statements: [], modelUsed: cfg.model };
    }
  }

  const paragraphs = article.paragraphs;
  const paraById = new Map(paragraphs.map((p) => [p.paragraphId, p]));
  const all: Statement[] = [];
  let lastModelUsed = cfg.model;
  const { windowSize, maxWindowRetries } = cfg;

  for (let i = 0; i < paragraphs.length; i += windowSize) {
    const window = paragraphs.slice(i, i + windowSize);
    const windowLabel = `window ${Math.floor(i / windowSize) + 1} (${i + 1}–${Math.min(i + windowSize, paragraphs.length)}/${paragraphs.length})`;
    const validParaIds = new Set(window.map((p) => p.paragraphId));

    let windowRows: LlmStatementRow[] = [];
    let succeeded = false;

    for (let attempt = 1; attempt <= maxWindowRetries; attempt++) {
      const quoteSnippets = detectQuoteSnippets(window);
      const isRetry =
        attempt > 1 && quoteSnippets.length > 0 && windowRows.length === 0;
      const userMsg = isRetry
        ? buildRetryUserMessage(window, quoteSnippets)
        : buildUserMessage(window);

      console.log(`[llmExtractStatements] ${windowLabel} attempt ${attempt}/${maxWindowRetries} …`);

      let rawContent: string;
      try {
        const out = await completeLlmChat(cfg, localClient, SYSTEM_PROMPT, userMsg);
        rawContent = out.rawContent;
        lastModelUsed = out.modelUsed;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[llmExtractStatements] ${windowLabel} chat error: ${msg.slice(0, 160)}`);
        continue;
      }

      windowRows = parseRows(rawContent, validParaIds);
      if (windowRows.length === 0 && quoteSnippets.length > 0 && attempt < maxWindowRetries) {
        console.warn(`[llmExtractStatements] ${windowLabel}: empty output — retry with quote hints`);
        continue;
      }
      succeeded = true;
      break;
    }

    for (const row of windowRows) {
      const stmt = rowToStatement(row, paraById, attestationId, contextWindowSize);
      if (stmt) all.push(stmt);
    }

    console.log(
      `[llmExtractStatements] ${windowLabel}: ${windowRows.length} row(s) from LLM → ${succeeded ? "built" : "partial"} statements`,
    );
  }

  const seen = new Set<string>();
  const deduped = all.filter((s) => {
    const key = `${s.sourceParagraphId}|${s.content.slice(0, 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[llmExtractStatements] Total: ${deduped.length} statement(s)`);
  return { statements: deduped, modelUsed: lastModelUsed };
}

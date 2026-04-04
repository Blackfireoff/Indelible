/**
 * Statement extraction pipeline – hybrid approach:
 *  Phase 1: Rules-based extraction for obvious direct quotes and attribution patterns.
 *  Phase 2: Constrained LLM fallback for ambiguous paragraphs (optional, skipped when
 *           no OPENAI_API_KEY is set or paragraph already yielded rule-based results).
 *
 * Non-negotiable rules:
 *  - content must be an exact substring of the source paragraph text.
 *  - No paraphrasing.
 *  - Every statement links to a sourceParagraphId.
 *  - Character offsets are exact and validated before acceptance.
 */

import type { ArticleParagraph } from "../schemas/cleanArticle.js";
import type { Statement, QuoteType } from "../schemas/statements.js";
import { statementId } from "../utils/ids.js";
import { normalizeSpeaker } from "../utils/speakerNormalization.js";
import { findExactSpan, extractContextWindow } from "../utils/offsets.js";

// ─────────────────────────────────────────────
// Phase 1: Rules-based extraction
// ─────────────────────────────────────────────

/** Common attribution verb patterns (English). */
const ATTRIBUTION_VERBS =
  "said|stated|declared|announced|told|warned|added|noted|confirmed|" +
  "argued|claimed|insisted|stressed|emphasized|acknowledged|admitted|" +
  "denied|explained|replied|wrote|tweeted|posted|remarked";

/**
 * Pattern for:  Speaker [, Role,] verb ["quote"] / [, "quote"]
 * Groups: 1=speaker, 2=role (optional), 3=verb, 4=quote content
 */
const DIRECT_QUOTE_BEFORE_ATTRIBUTION = new RegExp(
  `"([^"]{10,1000})"\\s*,?\\s*([A-Z][\\w\\s\\.\\-']{1,60}?)` +
  `(?:,\\s*([^,]{0,60}),)?\\s+(?:${ATTRIBUTION_VERBS})`,
  "g"
);

/**
 * Pattern for:  Speaker [, Role,] verb [that] "quote"
 * Groups: 1=speaker, 2=role (optional), 3=verb, 4=quote content
 */
const SPEAKER_THEN_QUOTE = new RegExp(
  `([A-Z][\\w\\s\\.\\-']{1,60}?)` +
  `(?:,\\s*([^,]{0,60}),)?\\s+` +
  `(?:${ATTRIBUTION_VERBS})\\s+(?:that\\s+)?` +
  `"([^"]{10,1000})"`,
  "g"
);

/**
 * Pattern for:  According to Speaker [, Role]: "quote" or plain text
 */
const ACCORDING_TO = new RegExp(
  `[Aa]ccording to ([A-Z][\\w\\s\\.\\-']{1,60?})(?:,\\s*([^,]{0,60}),)?[,:]?\\s+"([^"]{10,1000})"`,
  "g"
);

interface RuleMatch {
  speaker: string;
  role: string | null;
  quoteType: QuoteType;
  content: string;
  cue: string | null;
}

function extractRuleBasedMatches(paragraphText: string): RuleMatch[] {
  const results: RuleMatch[] = [];
  const seen = new Set<string>();

  const addIfNew = (match: RuleMatch) => {
    const key = `${match.speaker}|${match.content.slice(0, 60)}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(match);
    }
  };

  // Pattern: "quote", Speaker verb
  for (const m of paragraphText.matchAll(DIRECT_QUOTE_BEFORE_ATTRIBUTION)) {
    const content = m[1]?.trim();
    const speaker = m[2]?.trim();
    const role = m[3]?.trim() ?? null;
    if (content && speaker && content.length >= 10) {
      addIfNew({ speaker, role, quoteType: "direct", content, cue: null });
    }
  }

  // Pattern: Speaker verb "quote"
  for (const m of paragraphText.matchAll(SPEAKER_THEN_QUOTE)) {
    const speaker = m[1]?.trim();
    const role = m[2]?.trim() ?? null;
    const content = m[3]?.trim();
    if (content && speaker && content.length >= 10) {
      addIfNew({ speaker, role, quoteType: "direct", content, cue: null });
    }
  }

  // Pattern: According to Speaker, "quote"
  for (const m of paragraphText.matchAll(ACCORDING_TO)) {
    const speaker = m[1]?.trim();
    const role = m[2]?.trim() ?? null;
    const content = m[3]?.trim();
    if (content && speaker && content.length >= 10) {
      addIfNew({ speaker, role, quoteType: "direct", content, cue: "according to" });
    }
  }

  return results;
}

// ─────────────────────────────────────────────
// Phase 2: LLM fallback (constrained)
// ─────────────────────────────────────────────

interface LlmExtractedStatement {
  speaker: string;
  role: string | null;
  content: string;
  quoteType: QuoteType;
  cue: string | null;
}

const LLM_SYSTEM_PROMPT = `You are a political statement extractor.

RULES (non-negotiable):
1. Only extract statements made by named political figures or officials.
2. The "content" field MUST be an exact verbatim substring of the provided paragraph text – no paraphrasing, no summarizing.
3. Only extract direct quotes (delimited by quotation marks) or clearly attributed indirect statements.
4. If no attributable political statement exists, return an empty array.
5. Output ONLY valid JSON – no markdown, no explanation.

Output format:
[
  {
    "speaker": "Full Name",
    "role": "Title or role, or null",
    "content": "exact quote from paragraph",
    "quoteType": "direct | indirect",
    "cue": "said | according to | null"
  }
]`;

async function extractWithLlm(
  paragraphText: string
): Promise<LlmExtractedStatement[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

    const response = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: LLM_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract political statements from this paragraph:\n\n${paragraphText}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "[]";
    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) return parsed as LlmExtractedStatement[];

    // Handle wrapped {"statements": [...]} form
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as Record<string, unknown>)["statements"])
    ) {
      return (parsed as Record<string, unknown>)["statements"] as LlmExtractedStatement[];
    }

    return [];
  } catch (err) {
    console.warn("[extractWithLlm] LLM call failed:", (err as Error).message);
    return [];
  }
}

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

function validateContent(paragraphText: string, content: string): boolean {
  return paragraphText.includes(content) && content.trim().length >= 10;
}

// ─────────────────────────────────────────────
// Main extraction function
// ─────────────────────────────────────────────

export interface ExtractionOptions {
  useLlmFallback?: boolean;
  contextWindowSize?: number;
}

export async function extractStatements(
  paragraphs: ArticleParagraph[],
  attestationId: string,
  options: ExtractionOptions = {}
): Promise<Statement[]> {
  const { useLlmFallback = true, contextWindowSize = 200 } = options;
  const statements: Statement[] = [];

  for (const para of paragraphs) {
    const text = para.text;
    const ruleMatches = extractRuleBasedMatches(text);
    let hasRuleMatches = ruleMatches.length > 0;

    // Build statements from rule matches
    for (const match of ruleMatches) {
      const stmt = buildStatement(
        attestationId,
        para,
        match,
        text,
        contextWindowSize,
        "auto_accepted",
        0.85
      );
      if (stmt) statements.push(stmt);
    }

    // LLM fallback only for paragraphs with no rule-based results
    if (useLlmFallback && !hasRuleMatches) {
      const llmMatches = await extractWithLlm(text);
      for (const match of llmMatches) {
        if (!validateContent(text, match.content)) {
          // Content not verifiable as exact substring – mark needs_review
          const stmt = buildStatement(
            attestationId,
            para,
            match,
            text,
            contextWindowSize,
            "needs_review",
            0.4
          );
          if (stmt) statements.push(stmt);
          continue;
        }

        const stmt = buildStatement(
          attestationId,
          para,
          match,
          text,
          contextWindowSize,
          "needs_review", // LLM results always need human review
          0.6
        );
        if (stmt) statements.push(stmt);
      }
    }
  }

  return statements;
}

function buildStatement(
  attestationId: string,
  para: ArticleParagraph,
  match: RuleMatch | LlmExtractedStatement,
  paragraphText: string,
  contextWindowSize: number,
  validationStatus: import("../schemas/statements.js").ValidationStatus,
  confidence: number
): Statement | null {
  const content = match.content.trim();
  if (!content) return null;

  // Find exact span within the paragraph text
  const span = findExactSpan(paragraphText, content);
  let charStart: number;
  let charEnd: number;

  if (span) {
    [charStart, charEnd] = span;
    // Boost confidence for rule-based with verified span
    if (validationStatus === "auto_accepted") confidence = 0.9;
  } else {
    // Content not found as exact substring → reject or mark needs_review
    charStart = 0;
    charEnd = 0;
    validationStatus = "needs_review";
    confidence = Math.min(confidence, 0.3);
  }

  const contextWindow = extractContextWindow(
    paragraphText,
    charStart,
    charEnd,
    contextWindowSize
  );

  const normalizedId = normalizeSpeaker(match.speaker);
  const sid = statementId(attestationId, para.paragraphId, charStart, charEnd);

  return {
    statementId: sid,
    speaker: {
      name: match.speaker,
      role: match.role ?? null,
      normalizedId,
    },
    quoteType: match.quoteType,
    content,
    cue: match.cue ?? null,
    sourceParagraphId: para.paragraphId,
    charStart,
    charEnd,
    contextWindow,
    confidence,
    validation: {
      status: validationStatus,
      reviewRequired: validationStatus !== "auto_accepted",
    },
  };
}

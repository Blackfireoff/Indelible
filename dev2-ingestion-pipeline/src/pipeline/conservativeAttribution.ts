/**
 * Filtre conservateur d’attribution : précision > rappel.
 * Une citation n’est conservée que si le locuteur est explicitement ancré dans le texte de preuve.
 */

import type { ArticleParagraph } from "../schemas/cleanArticle.js";
import type { Statement } from "../schemas/statements.js";

/** Entités trop vagues pour servir de speaker fiable (insensible à la casse). */
const VAGUE_SPEAKER_HEAD = new Set([
  "sources",
  "source",
  "officials",
  "official",
  "analysts",
  "analyst",
  "experts",
  "expert",
  "observers",
  "observer",
  "critics",
  "critic",
  "insiders",
  "insider",
  "reports",
  "people",
  "someone",
  "many",
  "others",
  "unnamed",
  "anonymous",
  "eyewitnesses",
  "witnesses",
  "commentators",
  "commentator",
]);

const PRONOUN_ONLY = /^(he|she|they|it|we|you|i|one)$/;
const WEAK_REPORTED_SUBJECT =
  /\b(sources?|officials?|analysts?|experts?|observers?|critics?|insiders?)\s+(said|say|says|told|tell|noted|note|warned|warn|added|add|argued|claim|claimed|stated|state)\b/i;
const ACCORDING_TO_VAGUE =
  /\baccording\s+to\s+(sources?|officials?|analysts?|experts?|reports?|people|someone|many|others)\b/i;
const HE_SHE_SAID = /\b(he|she)\s+said\b/i;

export function isVagueSpeakerName(name: string): boolean {
  const n = name.trim();
  if (!n) return true;
  if (PRONOUN_ONLY.test(n.trim().toLowerCase())) return true;
  const first = n.split(/\s+/)[0]!.toLowerCase();
  if (VAGUE_SPEAKER_HEAD.has(first)) return true;
  return false;
}

function attributionWindow(para: string, content: string, radius = 400): string {
  const i = para.indexOf(content);
  if (i === -1) return para;
  const a = Math.max(0, i - radius);
  const b = Math.min(para.length, i + content.length + radius);
  return para.slice(a, b);
}

function speakerAppearsInText(haystack: string, speakerName: string): boolean {
  const h = haystack.toLowerCase();
  const s = speakerName.trim().toLowerCase();
  if (!s) return false;
  if (h.includes(s)) return true;
  const parts = speakerName.split(/\s+/).filter((w) => w.length > 2);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]!.toLowerCase();
    if (h.includes(last) && last.length >= 4) return true;
  }
  return false;
}

/**
 * Phrase(s) du paragraphe qui contiennent le texte cité (pour ancrage local).
 */
function sentencesContainingQuote(para: string, content: string): string[] {
  const parts = para.split(/(?<=[.!?])\s+/);
  const hits = parts.filter((s) => s.includes(content));
  return hits.length > 0 ? hits : [para];
}

/**
 * Phrases « avec citation » : motifs douteux uniquement sur ces phrases.
 * Locuteur : présence dans une fenêtre locale autour de la citation (plusieurs guillemets / même paragraphe).
 */
function hasExplicitAttributionSupport(
  paragraphText: string,
  speakerName: string,
  content: string,
): { ok: boolean; reason: string } {
  if (isVagueSpeakerName(speakerName)) {
    return { ok: false, reason: "vague or pronoun speaker" };
  }

  const win = attributionWindow(paragraphText, content, 420);
  if (!speakerAppearsInText(win, speakerName)) {
    return { ok: false, reason: "speaker not found in local window around quote" };
  }

  const quoteSentences = sentencesContainingQuote(paragraphText, content);
  for (const sent of quoteSentences) {
    if (ACCORDING_TO_VAGUE.test(sent)) {
      return { ok: false, reason: "according to <vague entity>" };
    }
    if (WEAK_REPORTED_SUBJECT.test(sent)) {
      return { ok: false, reason: "weak subject (sources/officials/… + reporting verb)" };
    }
    if (HE_SHE_SAID.test(sent) && !speakerAppearsInText(sent, speakerName)) {
      return { ok: false, reason: "he/she said in quote sentence without named speaker" };
    }
  }

  return { ok: true, reason: "ok" };
}

/**
 * Texte d’attribution minimal non vide : extrait du paragraphe autour locuteur + citation.
 */
export function deriveAttributionText(paragraphText: string, stmt: Statement): string | null {
  const { content, speaker } = stmt;
  const name = speaker.name.trim();
  if (!name || !content.trim()) return null;

  const idxQ = paragraphText.indexOf(content);
  const lower = paragraphText.toLowerCase();
  const nameLower = name.toLowerCase();
  let idxS = lower.indexOf(nameLower);
  if (idxS === -1) {
    const parts = name.split(/\s+/).filter((w) => w.length > 2);
    if (parts.length > 0) {
      const last = parts[parts.length - 1]!.toLowerCase();
      idxS = lower.indexOf(last);
    }
  }
  if (idxS === -1 || idxQ === -1) return null;

  const start = Math.min(idxS, idxQ);
  const end = Math.max(idxS + name.length, idxQ + content.length);
  const pad = 24;
  const slice = paragraphText.slice(Math.max(0, start - pad), Math.min(paragraphText.length, end + pad)).trim();
  const compact = slice.replace(/\s+/g, " ");
  if (compact.length < 8) return null;
  return compact.length > 320 ? `${compact.slice(0, 317)}…` : compact;
}

export interface ConservativeFilterOptions {
  /** Si false, garde aussi needs_review (défaut: false = tout rejeter sauf auto_accepted) */
  allowNeedsReview?: boolean;
}

/**
 * Filtre final conservateur : rejette toute entrée douteuse ; remplit `cue` quand il manque.
 */
export function filterConservativeStatements(
  statements: Statement[],
  paragraphsById: Map<string, ArticleParagraph>,
  options: ConservativeFilterOptions = {},
): Statement[] {
  const { allowNeedsReview = false } = options;
  const out: Statement[] = [];

  for (const stmt of statements) {
    if (!allowNeedsReview && stmt.validation.status !== "auto_accepted") {
      console.warn(
        `[conservativeAttribution] Drop ${stmt.statementId}: validation=${stmt.validation.status}`,
      );
      continue;
    }

    const para = paragraphsById.get(stmt.sourceParagraphId);
    if (!para) {
      console.warn(`[conservativeAttribution] Drop ${stmt.statementId}: missing paragraph`);
      continue;
    }

    const text = para.text;
    const support = hasExplicitAttributionSupport(text, stmt.speaker.name, stmt.content);
    if (!support.ok) {
      console.warn(`[conservativeAttribution] Drop ${stmt.statementId}: ${support.reason}`);
      continue;
    }

    const attributionText = deriveAttributionText(text, stmt);
    if (!attributionText || !attributionText.trim()) {
      console.warn(`[conservativeAttribution] Drop ${stmt.statementId}: empty attribution text`);
      continue;
    }

    const cue = (stmt.cue && stmt.cue.trim()) || attributionText;

    out.push({
      ...stmt,
      cue,
      confidence: Math.min(stmt.confidence, 0.95),
      validation: {
        status: "auto_accepted",
        reviewRequired: false,
      },
    });
  }

  return out;
}

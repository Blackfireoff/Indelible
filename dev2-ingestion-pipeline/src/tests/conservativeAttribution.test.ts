/**
 * Politique d’attribution conservatrice — précision > rappel.
 */

import { describe, it, expect } from "@jest/globals";
import type { ArticleParagraph } from "../schemas/cleanArticle.js";
import type { Statement } from "../schemas/statements.js";
import {
  filterConservativeStatements,
  isVagueSpeakerName,
} from "../pipeline/conservativeAttribution.js";
import { buildParagraphMap } from "../pipeline/validateStatements.js";

function stmt(partial: Partial<Statement> & Pick<Statement, "content" | "sourceParagraphId">): Statement {
  return {
    statementId: "s1",
    speaker: partial.speaker ?? {
      name: "Donald Trump",
      role: null,
      normalizedId: "donald_trump",
    },
    quoteType: "direct",
    cue: partial.cue ?? null,
    charStart: 0,
    charEnd: 10,
    contextWindow: { precedingText: "", followingText: "" },
    confidence: 0.9,
    validation: { status: "auto_accepted", reviewRequired: false },
    ...partial,
  } as Statement;
}

describe("isVagueSpeakerName", () => {
  it("rejects pronouns and vague collectives", () => {
    expect(isVagueSpeakerName("he")).toBe(true);
    expect(isVagueSpeakerName("Officials")).toBe(true);
    expect(isVagueSpeakerName("sources")).toBe(true);
    expect(isVagueSpeakerName("Donald Trump")).toBe(false);
    expect(isVagueSpeakerName("International Atomic Energy Agency")).toBe(false);
  });
});

describe("filterConservativeStatements", () => {
  const paraOk: ArticleParagraph = {
    paragraphId: "p1",
    order: 1,
    text: 'President Trump said "We will negotiate in good faith." at the Oval Office.',
    charStart: 0,
    charEnd: 80,
    sourceHints: { tagName: "p", cssSelector: null },
  };

  it("keeps explicit named attribution + quote", () => {
    const content = "We will negotiate in good faith.";
    const s = stmt({
      content,
      sourceParagraphId: "p1",
      speaker: { name: "Trump", role: null, normalizedId: "trump" },
      cue: null,
    });
    const map = buildParagraphMap([paraOk]);
    const out = filterConservativeStatements([s], map);
    expect(out).toHaveLength(1);
    expect(out[0].cue).toBeTruthy();
  });

  it("drops vague speaker", () => {
    const s = stmt({
      content: "hello world test here",
      sourceParagraphId: "p1",
      speaker: { name: "officials", role: null, normalizedId: "officials" },
    });
    const map = buildParagraphMap([paraOk]);
    const out = filterConservativeStatements([s], map);
    expect(out).toHaveLength(0);
  });

  it("drops needs_review unless allowed", () => {
    const s = stmt({
      content: "We will negotiate in good faith.",
      sourceParagraphId: "p1",
      validation: { status: "needs_review", reviewRequired: true },
    });
    const map = buildParagraphMap([paraOk]);
    expect(filterConservativeStatements([s], map)).toHaveLength(0);
    expect(filterConservativeStatements([s], map, { allowNeedsReview: true })).toHaveLength(1);
  });

  it("drops according-to-vague patterns", () => {
    const para: ArticleParagraph = {
      ...paraOk,
      text: 'According to analysts, "the market moved sharply today."',
    };
    const content = "the market moved sharply today.";
    const s = stmt({
      content,
      sourceParagraphId: "p1",
      speaker: { name: "Analysts", role: null, normalizedId: "analysts" },
    });
    const map = buildParagraphMap([para]);
    expect(filterConservativeStatements([s], map)).toHaveLength(0);
  });
});

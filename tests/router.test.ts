/**
 * Tests for deterministic router.
 */

import { routeIntent, normalizeSpeakerName, speakerMatches } from "../src/router";

describe("Router", () => {
  describe("routeIntent", () => {
    it("should accept verify-claim with speaker and claim", () => {
      const intent = {
        mode: "verify-claim" as const,
        confidence: 0.8,
        parsed: {
          speaker: "Trump",
          claim: "tariffs are working",
          topic: null,
          timeframe: null,
        },
      };
      const result = routeIntent(intent);
      expect(result.mode).toBe("verify-claim");
      expect(result.corrected).toBe(false);
    });

    it("should reject verify-claim without speaker", () => {
      const intent = {
        mode: "verify-claim" as const,
        confidence: 0.8,
        parsed: {
          speaker: null,
          claim: "tariffs are working",
          topic: null,
          timeframe: null,
        },
      };
      const result = routeIntent(intent);
      expect(result.mode).toBe("general-question");
      expect(result.corrected).toBe(true);
      expect(result.reason).toContain("speaker");
    });

    it("should reject verify-claim without claim", () => {
      const intent = {
        mode: "verify-claim" as const,
        confidence: 0.8,
        parsed: {
          speaker: "Trump",
          claim: null,
          topic: null,
          timeframe: null,
        },
      };
      const result = routeIntent(intent);
      expect(result.mode).toBe("general-question");
      expect(result.corrected).toBe(true);
      expect(result.reason).toContain("claim");
    });

    it("should accept detect-contradictions with speaker and topic", () => {
      const intent = {
        mode: "detect-contradictions" as const,
        confidence: 0.8,
        parsed: {
          speaker: "Trump",
          claim: null,
          topic: "tariffs",
          timeframe: null,
        },
      };
      const result = routeIntent(intent);
      expect(result.mode).toBe("detect-contradictions");
      expect(result.corrected).toBe(false);
    });

    it("should accept detect-contradictions with speaker and claim", () => {
      const intent = {
        mode: "detect-contradictions" as const,
        confidence: 0.8,
        parsed: {
          speaker: "Trump",
          claim: "we will impose broad tariffs",
          topic: null,
          timeframe: null,
        },
      };
      const result = routeIntent(intent);
      expect(result.mode).toBe("detect-contradictions");
      expect(result.corrected).toBe(false);
    });

    it("should reject detect-contradictions without speaker", () => {
      const intent = {
        mode: "detect-contradictions" as const,
        confidence: 0.8,
        parsed: {
          speaker: null,
          claim: null,
          topic: "tariffs",
          timeframe: null,
        },
      };
      const result = routeIntent(intent);
      expect(result.mode).toBe("general-question");
      expect(result.corrected).toBe(true);
    });

    it("should reject detect-contradictions without topic or claim", () => {
      const intent = {
        mode: "detect-contradictions" as const,
        confidence: 0.8,
        parsed: {
          speaker: "Trump",
          claim: null,
          topic: null,
          timeframe: null,
        },
      };
      const result = routeIntent(intent);
      expect(result.mode).toBe("general-question");
      expect(result.corrected).toBe(true);
    });

    it("should always accept general-question", () => {
      const intent = {
        mode: "general-question" as const,
        confidence: 0.5,
        parsed: {
          speaker: null,
          claim: null,
          topic: null,
          timeframe: null,
        },
      };
      const result = routeIntent(intent);
      expect(result.mode).toBe("general-question");
      expect(result.corrected).toBe(false);
    });
  });

  describe("normalizeSpeakerName", () => {
    it("should title-case names", () => {
      expect(normalizeSpeakerName("donald trump")).toBe("Donald Trump");
    });

    it("should remove 'the' prefix", () => {
      expect(normalizeSpeakerName("the white house")).toBe("White House");
    });

    it("should remove administration suffix", () => {
      expect(normalizeSpeakerName("trump administration")).toBe("Trump");
    });

    it("should return null for null input", () => {
      expect(normalizeSpeakerName(null)).toBeNull();
    });
  });

  describe("speakerMatches", () => {
    it("should match partial speaker names", () => {
      expect(speakerMatches("Trump", "Donald Trump")).toBe(true);
      expect(speakerMatches("Donald Trump", "Trump")).toBe(true);
    });

    it("should be case-insensitive", () => {
      expect(speakerMatches("trump", "DONALD TRUMP")).toBe(true);
    });

    it("should return false for null inputs", () => {
      expect(speakerMatches(null, "Trump")).toBe(false);
      expect(speakerMatches("Trump", null)).toBe(false);
    });

    it("should return false for non-matching names", () => {
      expect(speakerMatches("Biden", "Trump")).toBe(false);
    });
  });
});

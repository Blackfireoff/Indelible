/**
 * Tests for intent classification.
 */

import {
  classifyIntentByKeywords,
  parseIntentResponse,
} from "../src/intent/classifier";

describe("Intent Classification", () => {
  describe("classifyIntentByKeywords", () => {
    it("should classify verify-claim for 'did X say' queries", () => {
      const result = classifyIntentByKeywords("Did Trump say tariffs are working?");
      expect(result.mode).toBe("verify-claim");
      expect(result.confidence).toBe(0.7);
    });

    it("should classify verify-claim for 'is it true that' queries", () => {
      const result = classifyIntentByKeywords("Is it true that China is paying us billions?");
      expect(result.mode).toBe("verify-claim");
    });

    it("should classify detect-contradictions for 'contradictions' queries", () => {
      const result = classifyIntentByKeywords("Find contradictions in Trump's statements on tariffs.");
      expect(result.mode).toBe("detect-contradictions");
      expect(result.confidence).toBe(0.7);
    });

    it("should classify detect-contradictions for 'conflicting' queries", () => {
      const result = classifyIntentByKeywords("Are there conflicting statements about tariffs?");
      expect(result.mode).toBe("detect-contradictions");
    });

    it("should default to general-question for open-ended queries", () => {
      const result = classifyIntentByKeywords("What is the weather today?");
      expect(result.mode).toBe("general-question");
    });

    it("should extract speaker from 'X said' pattern", () => {
      const result = classifyIntentByKeywords("Trump said tariffs are working.");
      expect(result.parsed.speaker).toBe("Trump");
    });

    it("should extract topic from 'about X' pattern", () => {
      const result = classifyIntentByKeywords("What did Trump say about tariffs?");
      expect(result.parsed.topic).toBe("tariffs");
    });
  });

  describe("parseIntentResponse", () => {
    it("should parse valid JSON response", () => {
      const raw = JSON.stringify({
        mode: "verify-claim",
        confidence: 0.8,
        parsed: {
          speaker: "Trump",
          claim: "tariffs are working",
          topic: "tariffs",
          timeframe: null,
        },
      });
      const result = parseIntentResponse(raw);
      expect(result.mode).toBe("verify-claim");
      expect(result.confidence).toBe(0.8);
      expect(result.parsed.speaker).toBe("Trump");
    });

    it("should default invalid mode to general-question", () => {
      const raw = JSON.stringify({
        mode: "invalid-mode",
        confidence: 0.8,
        parsed: {},
      });
      const result = parseIntentResponse(raw);
      expect(result.mode).toBe("general-question");
    });

    it("should cap confidence at 1.0", () => {
      const raw = JSON.stringify({
        mode: "general-question",
        confidence: 1.5,
        parsed: {},
      });
      const result = parseIntentResponse(raw);
      expect(result.confidence).toBe(1.0);
    });

    it("should handle non-JSON response", () => {
      const result = parseIntentResponse("This is not JSON");
      expect(result.mode).toBe("general-question");
      expect(result.confidence).toBe(0.0);
    });

    it("should extract JSON from markdown code blocks", () => {
      const raw = "```json\n{\"mode\": \"verify-claim\", \"confidence\": 0.9, \"parsed\": {}}\n```";
      const result = parseIntentResponse(raw);
      expect(result.mode).toBe("verify-claim");
      expect(result.confidence).toBe(0.9);
    });
  });
});

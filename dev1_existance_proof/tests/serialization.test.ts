import { describe, it, expect } from "vitest";
import { serializeRawArtifact, deserializeRawArtifact } from "../workflow/utils/serialization";
import type { RawArtifact } from "../workflow/types";

const sampleArtifact: RawArtifact = {
  attestationId: "0xaaa111",
  requestId: "0xbbb222",
  url: "https://lemonde.fr/article405",
  observed_at: "2026-04-04T12:00:00.000Z",
  content_type: "text/html",
  raw_hash: "0xccc333",
  data_brut: "<html><body>Test</body></html>",
};

describe("serializeRawArtifact", () => {
  it("produces deterministic JSON (same input → same output)", () => {
    const json1 = serializeRawArtifact(sampleArtifact);
    const json2 = serializeRawArtifact(sampleArtifact);
    expect(json1).toBe(json2);
  });

  it("preserves key order", () => {
    const json = serializeRawArtifact(sampleArtifact);
    const keys = Object.keys(JSON.parse(json));
    expect(keys).toEqual([
      "attestationId",
      "requestId",
      "url",
      "observed_at",
      "content_type",
      "raw_hash",
      "data_brut",
    ]);
  });

  it("includes all fields", () => {
    const json = serializeRawArtifact(sampleArtifact);
    const parsed = JSON.parse(json);
    expect(parsed.attestationId).toBe(sampleArtifact.attestationId);
    expect(parsed.requestId).toBe(sampleArtifact.requestId);
    expect(parsed.url).toBe(sampleArtifact.url);
    expect(parsed.observed_at).toBe(sampleArtifact.observed_at);
    expect(parsed.content_type).toBe(sampleArtifact.content_type);
    expect(parsed.raw_hash).toBe(sampleArtifact.raw_hash);
    expect(parsed.data_brut).toBe(sampleArtifact.data_brut);
  });
});

describe("deserializeRawArtifact", () => {
  it("round-trips correctly", () => {
    const json = serializeRawArtifact(sampleArtifact);
    const deserialized = deserializeRawArtifact(json);
    expect(deserialized).toEqual(sampleArtifact);
  });

  it("throws on invalid JSON", () => {
    expect(() => deserializeRawArtifact("not json")).toThrow();
  });
});

describe("serialization determinism", () => {
  it("same artifact with different object construction order produces same JSON", () => {
    const artifact1: RawArtifact = {
      attestationId: "0x111",
      requestId: "0x222",
      url: "https://example.com",
      observed_at: "2026-01-01T00:00:00.000Z",
      content_type: "text/plain",
      raw_hash: "0x333",
      data_brut: "hello",
    };

    // Same data, different property order in source
    const artifact2: RawArtifact = {
      data_brut: "hello",
      raw_hash: "0x333",
      content_type: "text/plain",
      observed_at: "2026-01-01T00:00:00.000Z",
      url: "https://example.com",
      requestId: "0x222",
      attestationId: "0x111",
    };

    expect(serializeRawArtifact(artifact1)).toBe(serializeRawArtifact(artifact2));
  });
});

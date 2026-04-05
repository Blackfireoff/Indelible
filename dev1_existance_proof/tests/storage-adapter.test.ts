import { describe, it, expect } from "vitest";
import { Mock0GStorageAdapter } from "../workflow/adapters/storage/Mock0GStorageAdapter";
import type { RawArtifact } from "../workflow/types/RawArtifact";

const sampleArtifact: RawArtifact = {
  attestationId: "0xaaa111",
  requestId: "0xbbb222",
  url: "https://lemonde.fr/article405",
  observed_at: "2026-04-04T12:00:00.000Z",
  content_type: "text/html",
  raw_hash: "0xccc333",
  data_brut: "<html><body>Test content</body></html>",
};

describe("Mock0GStorageAdapter", () => {
  it("stores and retrieves an artifact", async () => {
    const adapter = new Mock0GStorageAdapter();

    const address = await adapter.putRawArtifact(sampleArtifact);
    expect(address).toBeTruthy();

    const retrieved = await adapter.getRawArtifact(address);
    expect(retrieved).toEqual(sampleArtifact);
  });

  it("returns a 0g://mock/ prefixed address", async () => {
    const adapter = new Mock0GStorageAdapter();
    const address = await adapter.putRawArtifact(sampleArtifact);
    expect(address).toMatch(/^0g:\/\/mock\/[0-9a-f]{64}$/);
  });

  it("produces deterministic addresses for the same artifact", async () => {
    const adapter = new Mock0GStorageAdapter();
    const address1 = await adapter.putRawArtifact(sampleArtifact);
    const address2 = await adapter.putRawArtifact(sampleArtifact);
    expect(address1).toBe(address2);
  });

  it("produces different addresses for different artifacts", async () => {
    const adapter = new Mock0GStorageAdapter();
    const address1 = await adapter.putRawArtifact(sampleArtifact);

    const otherArtifact: RawArtifact = {
      ...sampleArtifact,
      data_brut: "<html><body>Different</body></html>",
    };
    const address2 = await adapter.putRawArtifact(otherArtifact);
    expect(address1).not.toBe(address2);
  });

  it("throws when retrieving a non-existent address", async () => {
    const adapter = new Mock0GStorageAdapter();
    await expect(
      adapter.getRawArtifact("0g://mock/0xnonexistent")
    ).rejects.toThrow("No artifact found");
  });

  it("tracks store size correctly", async () => {
    const adapter = new Mock0GStorageAdapter();
    expect(adapter.size).toBe(0);

    await adapter.putRawArtifact(sampleArtifact);
    expect(adapter.size).toBe(1);

    const otherArtifact: RawArtifact = {
      ...sampleArtifact,
      attestationId: "0xddd444",
      data_brut: "other content",
    };
    await adapter.putRawArtifact(otherArtifact);
    expect(adapter.size).toBe(2);
  });

  it("has() returns correct results", async () => {
    const adapter = new Mock0GStorageAdapter();
    const address = await adapter.putRawArtifact(sampleArtifact);

    expect(adapter.has(address)).toBe(true);
    expect(adapter.has("0g://mock/0xnonexistent")).toBe(false);
  });
});
